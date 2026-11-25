# Drivers drive saved loops, and their positions are sent over a WebSocket

Each area gets about 60 road paths, each fetched with one OSRM `route` request: a loop from a parking place, out to a turning point 0.5 to 2.5 km away, and back. One loop per parking place lets a Driver set off from where it stands, and 20 places get a second loop so later Sandboxes in the area can drive different ones. A route request per Driver per journey would be far more than the public server (ADR 0003) allows.

An area is a centre with its parking places and loops, shared by every Sandbox opened within 1 km of it. Requests for new paths are at least one second apart across the whole API, areas take turns, and a path is given up after three failures until a Sandbox is next opened there.

A Driver's position is not stored or ticked. It is worked out from the simulation clock when asked for: distance driven is the time since it set off, at the path's average speed, varied by up to 15% per Driver so that two on one path drift apart. The Rider app is sent the positions once a second over a WebSocket at `/rider/live` and glides the cars between them. It sends its session token as the first message, because a browser cannot set headers on a WebSocket and a token in the address would be logged. We chose plain WebSockets over Socket.IO: the one feed needs only reconnection, which is a few lines.

## Consequences

- Areas are held in memory only, like Sandboxes (ADR 0005), as they too say roughly where a Rider is. Restarting the API means fetching the paths again. At most 100 areas are kept.
- A new area takes about a minute to have all its Drivers moving, longer when several areas are being fetched.
- A Sandbox that reuses an area has Drivers up to about 11 km away, as the area's centre may be 1 km from its own.
- Drivers ignore traffic, overlap each other, and may turn round abruptly where a loop starts again.
- An area placed while the routing server is unavailable is not shared.
