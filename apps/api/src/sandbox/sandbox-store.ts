export interface StoredSandbox {
  /** When its owner last did something, which keeps the Sandbox running. */
  lastActiveMs: number;
}

/** Holds one app's Sandboxes. Both apps' Sandboxes count toward the one limit on running ones. */
export abstract class SandboxStore<T extends StoredSandbox> {
  abstract findByAccount(accountId: string): Promise<T | null>;
  abstract save(accountId: string, sandbox: T): Promise<void>;
  /** Whether fewer than `limit` Sandboxes of other accounts were last active after `runningSince`. */
  abstract hasRoom(accountId: string, runningSince: number, limit: number): Promise<boolean>;
  /** Saves only if there is room, and says whether it did. It is one step, so visitors arriving together cannot all take the last place. */
  abstract saveIfRoom(accountId: string, sandbox: T, runningSince: number, limit: number): Promise<boolean>;
  /** Removes every Sandbox whose owner was last active at or before `lastActiveMs`. */
  abstract deleteIdleSince(lastActiveMs: number): Promise<void>;
}
