# Start the Ride from the simulation clock

The Rider is picked up 15 seconds of simulation time after the matched Driver reaches the Pickup Point, set with `DISPATCH_BOARDING_MS`. Whether that has happened is worked out from the clock when asked for, as the match is (ADR 0008), so nothing ticks. A Sandbox that stops after the pickup keeps the pickup time, so that resuming it cannot move it.

From pickup the Sandbox is sent as a Ride in place of the Ride Request, which is no longer open. We rejected a further Ride Request status, as a Ride is not a stage of a Ride Request.

The Ride's route from the Pickup Point to the Drop-off Point comes from `RoutingService` and is asked for once the route to the Pickup Point is found (ADR 0009). The vehicle drives it once at the time the router gives. With no route, the Ride has still started: the vehicle waits at the Pickup Point and the Rider is offered to look again (`POST /rider/rides/route`).

## Consequences

- A Driver with no route to the Pickup Point never picks the Rider up.
- The Ride does not complete yet (#56): the vehicle stays at the Drop-off Point, and the Rider can only start a new Sandbox.
