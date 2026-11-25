# Only a Rider's actions keep a Sandbox running

A Sandbox stops 15 minutes after the Rider last did something, and is discarded 24 hours after it stops. "Something" is a request the Rider causes: opening the Sandbox, requesting a Ride, cancelling the Ride Request, looking again for the matched Driver's route, or asking for a route, the Fares, a place search or the street at a pin. Watching the live feed does not count. We rejected counting a visible or merely open page, so that a page left on screen or forgotten in a tab does not hold a running Sandbox.

A stopped Sandbox sends no positions: the live feed closes with code 4410, and the Rider app keeps the cars where they are and asks whether to continue or start a new one. Closing that dialog leaves a button on the map. Only opening the Sandbox again resumes it (either button, a moved pin or a reload), so there is one place to refuse when too many are running. Its Drivers carry on from where they stopped. Starting a new one replaces it at once, with `fresh: true` on the same request. After 24 hours it is discarded and the next visit makes a new one. The account is not touched.

While a Sandbox is stopped, the Rider app looks at the live feed again once a minute, which counts as no activity, to learn whether it has been discarded and can no longer be continued.

At most 30 Sandboxes run at once. Only running ones count, so a stopped Sandbox frees its place. Opening one that is not running, whether new, resumed or fresh, is refused while 30 others are, with status 503 and the code `SANDBOX_LIMIT`; the code tells it apart from a server that cannot be reached. A running Sandbox keeps its place when it is opened again, moved or replaced. A refused Sandbox is left as it was. There is no queue: the Rider app says all Sandboxes are busy and offers to try again.

## Consequences

- A Rider who only watches the cars, or pans the map, sees the Sandbox stop after 15 minutes.
- The status is worked out from the simulation clock when asked for. A sweep every minute removes discarded Sandboxes whose Riders never return.
- The saved paths of an area (ADR 0006) are kept after its Sandboxes are discarded, and paths already queued are still fetched.
- A Rider app that lost its connection, and reconnects after its Sandbox was discarded, opens a new one without being asked.
- For up to a minute after a discard, the dialog still offers to continue, and doing so makes a new Sandbox.
- The count is kept by `SandboxRepository`, so several API processes would need to share it, as they would the Sandboxes (ADR 0005).
- A place goes to whoever asks first after it is freed, and a Rider who has been waiting has no priority.
- A Rider refused while continuing no longer has the live feed open, so learns that the Sandbox was discarded only by getting a new one on trying again.
