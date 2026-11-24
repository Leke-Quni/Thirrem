# Use free public map, search and routing services, worldwide

Thirrem draws its map from OpenFreeMap, searches street and place names with the public Photon geocoder, and gets routes from the public OSRM server, instead of self-hosting tiles and routing for Gjakova. This reverses the Gjakova-only scope in the parent spec and the "self-hosted tiles" line in issue #6.

The reason is reach: with public services the map works anywhere, so a visitor can place the Pickup Point at their real location and Drivers can later be simulated around them. Self-hosting would pin the demo to the regions we could build and hold in RAM on a home laptop, and generating data per visitor is far too slow. Both services need no key and no card, which keeps the $0 plan from issue #5.

## Consequences

- Both services are best-effort. If either changes its terms or goes down, the map or routing stops until we swap the provider. Tiles are fetched by the browser; routing goes only through our API, which caches routes, rate limits each client and sends a `thirrem-demo` User-Agent.
- Routing and place search sit behind the `RoutingService` and `PlaceSearchService` interfaces, so a self-hosted OSRM, OpenRouteService or another router can replace the public server by changing `OSRM_URL` or one adapter.
- The map attribution for OpenFreeMap, OpenMapTiles and OpenStreetMap must stay visible.
- Road quality outside Gjakova is whatever OpenStreetMap holds there. The Gjakova check in issue #2 no longer limits where the demo works.
- Rides outside a city the simulation understands are a later concern. Drivers and the Sandbox world are not yet placed anywhere.
