# Match Ride Requests from the simulation clock, over web map tile cells

A Ride Request is held in the Rider's Sandbox (ADR 0005). The quadtree cells it is broadcast over are web map tiles, from level 16 (about 450 m across at Gjakova) up to level 10 (about 29 km). The search starts at the smallest and moves up until the cell holding the Pickup Point has at least 5 Available Drivers of the Vehicle Type, then takes in the eight cells around it. If even a level 10 cell holds fewer, the Drivers in it and next to it are asked. The minimum is set with `DISPATCH_MIN_DRIVERS`.

When the Ride Request is broadcast, each Driver it is offered to is given the time it will accept, 2 to 8 seconds later. Who has been matched is worked out from the simulation clock when asked for, as positions are (ADR 0006), so nothing ticks. The Drivers are chosen once, from where they are at that moment.

While a Ride Request is open, its Sandbox keeps its Drivers even if the centre moves more than 1 km, so that a changed location does not silently drop it. Starting a new Sandbox drops it.

## Consequences

- Every offered Driver would accept. Declining and ignoring are left to the simulation controls (#25).
- A Sandbox has 10 Drivers of each Vehicle Type, so the cell chosen is often large and most of them are asked.
- A Ride Request with no Driver to ask stays searching until it is widened or failed (#11).
- Nothing yet closes a Ride Request: cancelling (#12) and pickup (#13) come later.
