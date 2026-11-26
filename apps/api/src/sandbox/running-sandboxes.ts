/** When each account's Sandbox was last active, across both apps. */
export class RunningSandboxes {
  private readonly lastActive = new Map<string, number>();

  seen(accountId: string, lastActiveMs: number): void {
    this.lastActive.set(accountId, lastActiveMs);
  }

  forget(accountId: string): void {
    this.lastActive.delete(accountId);
  }

  fewerOthersThan(limit: number, accountId: string, runningSince: number): boolean {
    let others = 0;
    for (const [id, lastActiveMs] of this.lastActive) {
      if (id !== accountId && lastActiveMs > runningSince) others += 1;
    }
    return others < limit;
  }
}
