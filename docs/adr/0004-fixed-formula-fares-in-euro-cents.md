# Fix the Fare with one formula, in euro cents, with a long-distance surcharge

A Fare is `base + per km × distance + per minute × duration`, plus an extra per-km amount on each kilometre past 20 km, with its own rates for Economy, Comfort, XL and Electric. Electric starts with the same rates as Comfort. Distance and duration come from the route, and the API calculates the Fare so the client cannot set it. There is no surge pricing or time-of-day pricing, so the calculation does not read the simulation clock.

The surcharge covers the Driver's empty return and fuel on long trips, which the base rates (set so a short city trip costs about €2 to €4) do not. The rates were chosen by hand against real trip prices. Building the per-km rate from a fuel price, consumption and margin is a possible later change if they stop making sense.

## Consequences

- All rates and the threshold live in `apps/api/src/fares/fare-rates.ts` and reach the API through `AppConfig`.
- Amounts are whole euro cents, rounded once at the end of the sum.
- A quote is not stored. The Ride Request (issue #10) and payment (issue #14) will have to record the Fare the Rider saw.
