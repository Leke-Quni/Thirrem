import { type Sandbox, SandboxRepository } from './sandbox.repository.js';

export class InMemorySandboxRepository extends SandboxRepository {
  private readonly sandboxes = new Map<string, Sandbox>();

  async findByAccount(accountId: string): Promise<Sandbox | null> {
    return this.sandboxes.get(accountId) ?? null;
  }

  async save(accountId: string, sandbox: Sandbox): Promise<void> {
    this.sandboxes.set(accountId, sandbox);
  }

  async hasRoom(accountId: string, runningSince: number, limit: number): Promise<boolean> {
    return this.fewerOthersRunning(accountId, runningSince, limit);
  }

  async saveIfRoom(accountId: string, sandbox: Sandbox, runningSince: number, limit: number): Promise<boolean> {
    if (!this.fewerOthersRunning(accountId, runningSince, limit)) return false;
    this.sandboxes.set(accountId, sandbox);
    return true;
  }

  async deleteIdleSince(lastActiveMs: number): Promise<void> {
    for (const [accountId, sandbox] of this.sandboxes) {
      if (sandbox.lastActiveMs <= lastActiveMs) this.sandboxes.delete(accountId);
    }
  }

  private fewerOthersRunning(accountId: string, runningSince: number, limit: number): boolean {
    let others = 0;
    for (const [id, { lastActiveMs }] of this.sandboxes) {
      if (id !== accountId && lastActiveMs > runningSince) others += 1;
    }
    return others < limit;
  }
}
