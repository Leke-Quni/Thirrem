import type { RunningSandboxes } from './running-sandboxes.js';
import { SandboxStore, type StoredSandbox } from './sandbox-store.js';

export class InMemorySandboxRepository<T extends StoredSandbox> extends SandboxStore<T> {
  private readonly sandboxes = new Map<string, T>();

  constructor(private readonly running: RunningSandboxes) {
    super();
  }

  async findByAccount(accountId: string): Promise<T | null> {
    return this.sandboxes.get(accountId) ?? null;
  }

  async save(accountId: string, sandbox: T): Promise<void> {
    this.put(accountId, sandbox);
  }

  async hasRoom(accountId: string, runningSince: number, limit: number): Promise<boolean> {
    return this.running.fewerOthersThan(limit, accountId, runningSince);
  }

  async saveIfRoom(accountId: string, sandbox: T, runningSince: number, limit: number): Promise<boolean> {
    if (!this.running.fewerOthersThan(limit, accountId, runningSince)) return false;
    this.put(accountId, sandbox);
    return true;
  }

  async deleteIdleSince(lastActiveMs: number): Promise<void> {
    for (const [accountId, sandbox] of this.sandboxes) {
      if (sandbox.lastActiveMs > lastActiveMs) continue;
      this.sandboxes.delete(accountId);
      this.running.forget(accountId);
    }
  }

  private put(accountId: string, sandbox: T): void {
    this.sandboxes.set(accountId, sandbox);
    this.running.seen(accountId, sandbox.lastActiveMs);
  }
}
