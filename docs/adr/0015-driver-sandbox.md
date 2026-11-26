# A Driver's Sandbox holds only their car, and shares the Rider limit

An approved Driver opens their Sandbox with `PUT /driver/sandbox`, sending a centre: the device location, or Gjakova when that is unavailable. A Driver who is not approved is refused with status 403. The Sandbox holds the Driver's own car, parked on the nearest street. Simulated Riders and Ride Requests come with issue #17. We left out other simulated Drivers: nothing in the Driver app involves them yet.

The Sandbox follows ADR 0007: it stops 15 minutes after the Driver last opened it, is discarded 24 hours after it stops, and lives only in the API's memory (ADR 0005). The limit of 30 running Sandboxes covers both apps together, as they run on the same machine. `RunningSandboxes` holds that one count.

Nothing moves, so there is no live feed. The Driver app reads `GET /driver/sandbox` every 5 seconds while the Sandbox runs, which does not count as activity, and stops reading once it has stopped. Opening it again resumes it, or makes a new one if it has been discarded, so the app does not need to tell the two apart.

## Consequences

- A busy Rider app can turn Drivers away, and the other way round.
- A Driver who only watches the map sees the Sandbox stop after 15 minutes.
- Once the Sandbox has things that move, the polling should give way to a live feed like the Rider's (ADR 0006).
