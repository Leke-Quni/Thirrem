import type { Sandbox } from './sandbox.repository.js';

/** Told what becomes of the journeys in Sandboxes, which outlive neither a restart nor their Sandbox. */
export abstract class JourneyLedger {
  /**
   * Notes what the account's journeys have come to by `nowMs`, going by its Sandbox, or null if it has none.
   * `dropping` says the Sandbox's journey is about to be dropped. Call it in the account's turn.
   */
  abstract record(accountId: string, sandbox: Sandbox | null, nowMs: number, dropping?: boolean): Promise<void>;
  /** Carries out what has been noted. It does not fail, as what it cannot do now is done later. */
  abstract settle(accountId: string): Promise<void>;
}
