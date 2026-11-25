import { type Sandbox, SandboxRepository } from './sandbox.repository.js';

export class InMemorySandboxRepository extends SandboxRepository {
  private readonly sandboxes = new Map<string, Sandbox>();

  async findByAccount(accountId: string): Promise<Sandbox | null> {
    return this.sandboxes.get(accountId) ?? null;
  }

  async save(accountId: string, sandbox: Sandbox): Promise<void> {
    this.sandboxes.set(accountId, sandbox);
  }

  async deleteIdleSince(lastActiveMs: number): Promise<void> {
    for (const [accountId, sandbox] of this.sandboxes) {
      if (sandbox.lastActiveMs <= lastActiveMs) this.sandboxes.delete(accountId);
    }
  }
}
