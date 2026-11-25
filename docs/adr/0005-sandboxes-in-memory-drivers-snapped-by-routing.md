# Keep Sandboxes in memory, and put Drivers on streets with one routing request

A Sandbox lives only in the API's memory. It holds where the Rider's simulated Drivers are, which says roughly where the Rider is, so none of it is written to the database. The Rider app chooses the centre: the device location, or the Pickup Point (then Gjakova) when the location is unavailable, or a Pickup Point more than 10 km from the device.

Random points would put Drivers in fields and buildings. One OSRM `table` request reports the nearest road point of every coordinate it is given, so 200 candidate points are snapped with one request instead of one `nearest` request each. In each distance ring the candidates closest to a road are chosen: a random point is more often close to one where streets are dense, so Drivers lean towards built-up areas. Beyond 1 km, Drivers are kept 500 m apart so they do not bunch in one village. A second request, a route through the 40 chosen points, gives the direction of the street at each, which the car faces.

We wanted to count street length instead. OpenFreeMap's terms do not allow the API to collect its tiles automatically, and the public Overpass servers ask apps not to rely on them as a backend. Downloading OpenStreetMap extracts would only cover chosen regions.

## Consequences

- Restarting the API discards every Sandbox. The next visit creates a new one.
- Sandboxes are not shared between API processes, so running several would need a shared store behind `SandboxRepository`.
- Points near the Rider are sent to the public routing server, as pins already are (ADR 0003).
- The leaning towards built-up areas is approximate.
- If the routing server is unavailable, Drivers still appear, but not necessarily on streets, and face random directions.
