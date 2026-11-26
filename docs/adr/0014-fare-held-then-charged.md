# Hold the Fare when a Ride is requested, charge it when it ends, and keep the payment

The quoted Fare is held on the Rider's default method before any Driver is searched for, as a Stripe payment captured later. It is worked out by the API from the road route between the two points, as the Fare Quote is. A completed Ride, or one ended early (ADR 0013), is charged its final Fare, never above the amount held, and the rest is released. The whole hold is released when the journey cannot finish: it is cancelled, no Driver is found, its Sandbox is replaced or lost, or a route cannot be had. We rejected charging only at the end, as a Ride could then be taken with a card that cannot pay.

When the bank asks to verify the Rider (3D Secure), the request is refused with what the app needs to do that. The app sends the request again, and the API asks Stripe whether the check passed. Anything else counts as a failed hold. A hold nobody comes back to is released after 10 minutes.

A route search that gives up releases the hold at once, although the Rider can look again (ADR 0009, 0010). Looking again holds the Fare again first, so a card declined by then stops it. We rejected keeping the hold while the offer stands, as money would sit held on a journey that may never move, and closing the journey, as the routing server is often back a moment later.

A timer charges and releases each second, whether or not the app is open, and opening the Sandbox or requesting a Ride does it too. What a journey came to is written down before Stripe is asked, so a charge that fails is tried again after its Sandbox has gone.

## An exception to ADR 0005

Sandboxes, Ride Requests and Rides are still held in memory and reset as before. Open holds and payments are kept in the database: the date, Vehicle Type, the names of the Pickup Point and Drop-off Point, distance, time, amounts held and charged, and the outcome. Money held must outlive a restart to be released, and a Rider's record of what they paid must outlive their Sandbox.

The names say roughly where the Rider was, which ADR 0005 avoids keeping. No coordinates are saved: a pin with no street name is kept as "Pin on the map". The app sends the names, as it is what looks them up, and the API takes them as given.

## Consequences

- Without Stripe keys, nothing is held and Rides are free.
- A Ride Request now needs the routing server, to price it.
- A lost Sandbox's hold is released even if its Ride had finished but had not yet been noted, which the timer leaves about a second for.
- A hold whose Stripe answer is lost, by a crash or a broken connection, is not released by the API. Stripe releases it after about 7 days.
- A Fare whose hold can no longer be charged is marked unpaid. Retrying it comes with #67.
- The timer looks at Sandboxes in this API process only, so several processes would need shared Sandboxes (ADR 0005) before any could settle safely.
