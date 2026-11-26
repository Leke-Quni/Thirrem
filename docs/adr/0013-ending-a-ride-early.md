# A Rider asks to end a Ride early, and the Driver stops

A Rider on a Ride can ask the Driver to end it early (`POST /rider/rides/end`). The simulated Driver drives on for 5 seconds of its route, set with `DISPATCH_STOP_MS`, then stops, which completes the Ride (ADR 0011). We rejected ending it as the Rider asks, as the Fare would stop while the vehicle was still moving with the Rider in it.

The stop is kept as a point on the Ride's route, in driving time, so a stopped Sandbox does not bring it nearer. The final Fare is the Vehicle Type's formula (ADR 0004) applied to the time driven to that point and the same share of the route's distance, as the vehicle drives the route at a steady speed. A request made too close to the Drop-off Point completes there, charged as the whole Ride.

The Ride says whether it has been asked for (`endRequested`), and asking again changes nothing. It can only be asked while the vehicle is driving a route: before the route is found there is nothing to stop on. The Rider app confirms before asking, and an asked Ride cannot be taken back.

## Consequences

- The simulated Driver always stops. The limit on how long a Fare may grow while a Driver does not, and ending a Ride asked for in person, come with the Driver app (#17).
- A Ride with no route to the Drop-off Point cannot be ended early. The Rider can look for the route again or start a new Sandbox.
