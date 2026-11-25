# Complete the Ride as the vehicle reaches the Drop-off Point

A Ride is completed once the vehicle has driven its route to the Drop-off Point. As with the pickup (ADR 0010), that is worked out from the clock when asked for, so nothing ticks, and a stopped Sandbox adds nothing to the distance driven.

The final Fare is the Vehicle Type's formula (ADR 0004) applied to the distance and time of the Ride's route. It is worked out when asked for and sent as `finalFare` on the Ride, which is null until the Ride has completed. We rejected reusing the Fare Quote, as a Fare follows the distance and time travelled.

The completed Ride stays in the Sandbox until another Ride Request takes its place. It no longer counts as under way: its Driver is Available, and the Sandbox is replaced as usual if the centre moves. The Driver waits at the Drop-off Point from then on. We rejected putting it back on its saved path (ADR 0006), which would make it jump across the map.

## Consequences

- A Driver who has dropped a Rider off stays parked for the life of the Sandbox.
- The completed Ride is the only record of the Fare. Payment and receipts (#14) will have to store it.
- The Rider app only remembers until a reload that the Rider has moved on, so a reload shows the completed Ride again.
- A Ride with no route to the Drop-off Point never completes.
