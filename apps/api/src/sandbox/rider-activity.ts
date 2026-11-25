/** Told when a Rider does something, which keeps their Sandbox running. */
export abstract class RiderActivity {
  /** A stopped Sandbox stays stopped: only opening it brings it back. */
  abstract record(accountId: string): Promise<void>;
}
