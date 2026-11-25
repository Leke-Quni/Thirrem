import { Inject, type OnModuleDestroy, UnauthorizedException } from '@nestjs/common';
import { ConnectedSocket, MessageBody, type OnGatewayConnection, type OnGatewayDisconnect, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import type { SandboxLiveCloseCode, SandboxLiveMessage } from '@thirrem/types';
import type { WebSocket } from 'ws';
import type { Account } from '../auth/account.repository.js';
import { AuthService } from '../auth/auth.service.js';
import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/app-config.provider.js';
import { SandboxService } from './sandbox.service.js';

const SERVER_ERROR = 1011;

interface Watcher {
  helloTimeout: NodeJS.Timeout;
  feed?: NodeJS.Timeout;
  greeted: boolean;
}

/**
 * Sends a Rider their Sandbox's Drivers and Ride Request for as long as the connection is open.
 * Browsers cannot set headers on a WebSocket, and a token in the address would be logged, so it arrives as the first message.
 */
@WebSocketGateway({ path: '/rider/live', maxPayload: 1_024 })
export class RiderLiveGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  private readonly watchers = new Map<WebSocket, Watcher>();

  constructor(
    private readonly auth: AuthService,
    private readonly sandboxes: SandboxService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  handleConnection(client: WebSocket): void {
    const helloTimeout = setTimeout(() => this.drop(client, 4408), this.config.live.helloTimeoutMs);
    this.watchers.set(client, { helloTimeout, greeted: false });
  }

  handleDisconnect(client: WebSocket): void {
    const watcher = this.watchers.get(client);
    clearTimeout(watcher?.helloTimeout);
    clearInterval(watcher?.feed);
    this.watchers.delete(client);
  }

  onModuleDestroy(): void {
    for (const client of this.watchers.keys()) {
      this.handleDisconnect(client);
      client.terminate();
    }
  }

  @SubscribeMessage('watch')
  async watch(@ConnectedSocket() client: WebSocket, @MessageBody() body: { token?: unknown } | undefined): Promise<void> {
    const watcher = this.watchers.get(client);
    if (!watcher || watcher.greeted) return;
    watcher.greeted = true;
    clearTimeout(watcher.helloTimeout);
    const token = typeof body?.token === 'string' ? body.token : undefined;
    let account: Account;
    try {
      account = await this.auth.authenticate('rider', token);
    } catch (error) {
      return this.drop(client, error instanceof UnauthorizedException ? 4401 : SERVER_ERROR);
    }
    if (!(await this.send(client, account.id)) || !this.watchers.has(client)) return;
    watcher.feed = setInterval(() => void this.send(client, account.id), this.config.live.intervalMs);
  }

  private async send(client: WebSocket, accountId: string): Promise<boolean> {
    const sandbox = await this.sandboxes.watch(accountId);
    if (!sandbox || sandbox === 'stopped') {
      this.drop(client, sandbox ? 4410 : 4404);
      return false;
    }
    // A client still receiving the last positions is not sent more to queue up behind them.
    if (client.readyState === client.OPEN && client.bufferedAmount === 0) {
      const message: SandboxLiveMessage = { event: 'drivers', data: sandbox };
      client.send(JSON.stringify(message));
    }
    return true;
  }

  private drop(client: WebSocket, code: SandboxLiveCloseCode | typeof SERVER_ERROR): void {
    this.handleDisconnect(client);
    client.close(code);
  }
}
