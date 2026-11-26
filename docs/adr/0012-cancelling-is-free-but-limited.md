# Cancelling is free, but too much of it pauses Ride Requests

A Rider can cancel an open Ride Request (`DELETE /rider/ride-requests`) at no cost in money, but cancelling after a match wastes a Driver's time, so it is limited. A cancel within 30 seconds of the match is a quick one, and a later one is late. Five quick cancels, or three late ones, within 30 minutes pause new Ride Requests for 15 minutes. We rejected a late-cancel fee, as there are no payments yet and the spec has no cancellation fees, and only asking the Rider to confirm, which stops nobody.

Cancelling while searching never counts, and neither does cancelling when no route to the Pickup Point could be had, which is not the Rider's doing. Starting a new Sandbox drops the Ride Request, so with a matched Driver it counts the same way.

The Ride Request says what cancelling it would count toward (`cancellation`). The Rider app makes a quick cancel in one click, from a button counting down the time left, as reading a confirmation would use up that time. It asks first for a late cancel, and for any that would pause Ride Requests, in one line, with a button that has to be held for 1.5 seconds. Assistive technology cannot hold it, so a single activation cancels there. One that would pause Ride Requests is refused unless sent with `?pause=accepted`, so that a click made just as a Driver is matched cannot pause a Rider unwarned.

After the second late cancel or the fourth quick one, the Rider app warns that more cancelling will pause Ride Requests, in a message that closes after 8 seconds, or sooner by hand, and waits while pointed at or focused. It shows only as `cancelWarningAtMs` changes while the page is open, so a reload does not bring it back.

The counted cancels belong to the account, not to the Sandbox (ADR 0001), or a new Sandbox would clear them. Times come from the simulation clock.

The released Driver is Available at once, and stays where it was until a road path starting there is ready, as the one it left would make it jump.

## Consequences

- The history is held in memory, so restarting the API clears every count and pause.
- A Rider with several accounts has a limit for each.
- The 30 minutes and the pause follow the simulation clock, so speed options (#25) shorten both.
- The new Sandbox warning is shown by the app only: the API does not refuse a new Sandbox that would pause Ride Requests.
- The Rider app states the limits in its own text, which has to change with the API's.
- A released Driver waits parked while the road service cannot be had, and each opening of the Sandbox asks again.
