# Find the route to the Pickup Point as the Ride Request is made

Who will be matched is settled as the Ride Request is made, since every broadcast and each Driver's accept time are worked out then (ADR 0008). So the API works out where that Driver will be as it accepts, and asks for the road route from there to the Pickup Point straight away, without keeping the Rider waiting for the answer. It is usually there by the time of the match. We rejected asking for it when the match is first seen, as that would make reading a Sandbox change it, and the live feed reads it every second.

The route comes from `RoutingService`, like the trip's own route (ADR 0003). The Driver drives it once at the time the router gives, and its position and the time left are worked out from the simulation clock (ADR 0006). A stopped Sandbox adds nothing to the distance driven.

If the routing server cannot be had, the API tries twice more by itself, after 2 and then 5 seconds. An answer that there is no road is taken as final. With no route, the Driver waits where it was matched and the Rider is offered to look again (`POST /rider/ride-requests/approach`), which counts as activity (ADR 0007), or to start a new Sandbox. We rejected retrying until it works, which would load a public server that may be refusing us, and drawing a straight line in place of a road.

## Consequences

- A slow routing server can leave the Rider seeing the search for about half a minute before the offer to look again, as each try waits up to 8 seconds.
- Declining and ignoring (#25) can change who is matched, so the route will have to be asked for again when that happens.
- A Driver that was parked as the Ride Request was made and was given a loop before accepting can jump a few metres as it is matched.
- The routing cache remembers that two points have no road route, so looking again helps with an unreachable server but not with that.
- The live feed sends the road still ahead every second while the Driver is on its way. The Rider app starts that line at the car as it draws it, so the line shrinks as the car glides.
- The map shows the route to the Pickup Point in place of the trip's route until the Driver arrives.
