# Hold the Fare when a Ride is requested, charge it when it ends, and keep the payment

The quoted Fare is held on the Rider's default method before any Driver is searched for, as a Stripe payment captured later. It is worked out by the API from the road route between the two points, as the Fare Quote is. A completed Ride, or one ended early (ADR 0013), is charged its final Fare, never above the amount held, and the rest is released. The whole hold is released when the journey cannot finish: it is cancelled, no Driver is found, its Sandbox is replaced or lost, or a route cannot be had. We rejected charging only at the end, as a Ride could then be taken with a card that cannot pay.

When the bank asks to verify the Rider (3D Secure), the request is refused with what the app needs to do that. The app sends the request again, and the API asks Stripe whether the check passed. Anything else counts as a failed hold. A hold nobody comes back to is released after 10 minutes.

A route search that gives up releases the hold at once, although the Rider can look again (ADR 0009, 0010). Looking again holds the Fare again first, so a card declined by then stops it. We rejected keeping the hold while the offer stands, as money would sit held on a journey that may never move, and closing the journey, as the routing server is often back a moment later.

A timer charges and releases each second, whether or not the app is open, and opening the Sandbox or requesting a Ride does it too. What a journey came to is written down before Stripe is asked, so a charge that fails is tried again after its Sandbox has gone.

## A Fare that could not be charged

A charge fails when its hold has gone or the card refuses it. The Fare is then unpaid, and the account cannot make a Ride Request until it is paid. A charge Stripe does not answer is not a failed one: the money is still held, so it is tried again and stops nobody. Asking for a Ride Request, or for what is owed, first charges what has fallen due, so a failure is known at once.

Paying places a new hold for the amount due on the method the Rider chooses, and captures it, so that bank verification works as it does for a Ride Request. The default method is not changed. A hold waiting on the bank is released after 10 minutes, or when the Rider starts over, and the Fare stays unpaid. The same payment row is kept, with the newest hold, so a Ride has one record of what was paid.

## Receipts

A charged payment is the Ride's receipt (`GET /rider/receipts`, 6 at a time), with no separate record to keep in step. The base, distance, time and long-distance amounts are saved as the Fare falls due, so a later change of rates leaves old receipts as they were. They are rounded as a running total, so they add up to the Fare, which is still rounded once. Where the charge was limited to the quoted Fare, the receipt shows what was taken off as an amount of its own. We rejected shrinking the four amounts to fit, as they would then match no rate.

The brand, last four digits and wallet of the newest hold's card are saved on the payment, so a receipt can name it after the method is removed. Payments charged before these were saved have no receipt.

## An exception to ADR 0005

Sandboxes, Ride Requests and Rides are still held in memory and reset as before. Open holds and payments are kept in the database: the date, Vehicle Type, the names of the Pickup Point and Drop-off Point, distance, time, amounts held and charged, what the Fare is made of, the card's brand, last four digits and wallet, and the outcome. Money held must outlive a restart to be released, and a Rider's record of what they paid must outlive their Sandbox.

The names say roughly where the Rider was, which ADR 0005 avoids keeping. No coordinates are saved: a pin with no street name is kept as "Pin on the map". The app sends the names, as it is what looks them up, and the API takes them as given.

## Consequences

- Without Stripe keys, nothing is held and Rides are free.
- A Ride Request now needs the routing server, to price it.
- A lost Sandbox's hold is released even if its Ride had finished but had not yet been noted, which the timer leaves about a second for.
- A hold whose Stripe answer is lost, by a crash or a broken connection, is not released by the API. Stripe releases it after about 7 days.
- Without Stripe keys, an unpaid Fare cannot be paid, but stops nobody.
- The timer looks at Sandboxes in this API process only, so several processes would need shared Sandboxes (ADR 0005) before any could settle safely.
