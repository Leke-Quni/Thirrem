# Match Ride Requests from the simulation clock, over web map tile cells

A Ride Request is held in the Rider's Sandbox (ADR 0005). The quadtree cells it is broadcast over are web map tiles, from level 16 (about 450 m across at Gjakova) up to level 10 (about 29 km). The first broadcast is to the Available Drivers of the Vehicle Type in the level 16 cell holding the Pickup Point and the eight cells around it, however few they are.

Each broadcast waits 9 seconds of simulation time, set with `DISPATCH_ACCEPT_WINDOW_MS`. If nobody has accepted, the search moves to the parent cell and its neighbours, and asks everyone there again. When the level 10 window passes too, 63 seconds in all, the Ride Request has failed, which closes it: the Rider can make another. We rejected starting at the first cell holding at least 5 Drivers, so that the closest Drivers are always asked first, and stopping after three areas, so that every Driver on the map is asked.

When the Ride Request is made, every broadcast it may need is worked out, with each Driver given the time it will accept, 2 to 8 seconds after that broadcast. Which broadcasts have been made, who has been matched and whether it has failed are worked out from the simulation clock when asked for, as positions are (ADR 0006), so nothing ticks. The Drivers for every area are chosen once, from where they are when the Rider asks.

While a Ride Request is open, its Sandbox keeps its Drivers even if the centre moves more than 1 km, so that a changed location does not silently drop it. Starting a new Sandbox drops it.

## Consequences

- Every offered Driver would accept. Declining and ignoring are left to the simulation controls (#25).
- As every offered Driver accepts well inside the window, a search fails only when there is no Driver to ask, until #25.
- A Rider with no Driver close by waits through empty areas, 9 seconds each, before anyone is asked.
- A widened broadcast can reach a Driver who has since driven elsewhere, or miss one who has driven in.
- Only failing closes a Ride Request so far: cancelling (#12) and pickup (#13) come later.
