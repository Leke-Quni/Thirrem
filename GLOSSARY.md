# Thirrem

A simulated ride-hailing marketplace, in the spirit of Uber and Lyft, built as a solo portfolio piece. No real people, vehicles or money are involved.

## Language

**Rider**:
A person who requests transportation from one place to another.
_Avoid_: Passenger, customer, user

**Driver**:
A person who accepts requests and carries Riders to their destinations.
_Avoid_: Captain, partner, operator

**Ride Request**:
A Rider's ask to find a Driver for a journey, open from the moment it is made until the Rider is picked up, or it is cancelled or fails. Matching a Driver does not close it.
_Avoid_: Booking, trip request, order

**Ride**:
The journey itself, from the moment a Rider is picked up until they are dropped off.
_Avoid_: Trip, journey, job

**Shared Ride**:
A Ride in which the Rider has agreed to share the vehicle with another Rider heading a similar way. A Rider chooses this for each Ride Request, even when sharing is enabled in their settings.
_Avoid_: Pool, carpool, split ride

**Scheduled Ride Request**:
A Ride Request made for a pickup at a future time, which only starts looking for a Driver shortly before that time.
_Avoid_: Reservation, advance booking

**Pickup Point**:
The place on the map where a Rider is collected, either a named place or a pin the Rider dropped.
_Avoid_: Address, origin, pickup address

**Drop-off Point**:
The place on the map where a Rider is let out, either a named place or a pin the Rider dropped.
_Avoid_: Address, destination, dropoff address

**Fare**:
The amount a Rider pays for a Ride, set by the Vehicle Type and the distance and time travelled.
_Avoid_: Price, cost, charge

**Receipt**:
The record of what a Rider paid for a Ride: its Fare broken into amounts, the total charged and the payment method. There is one for each paid Ride.
_Avoid_: Invoice, bill

**Vehicle Type**:
A category of vehicle a Rider can choose, each with its own Fare rate. There are four: Economy, Comfort, XL and Electric.
_Avoid_: Ride type, tier, class

**Fare Quote**:
The Fare for each Vehicle Type, shown for a route before the Rider requests a Ride.
_Avoid_: Estimate, price list

**Sandbox**:
A visitor's private, self-contained simulated world within one app, holding its own Riders, Drivers and Rides, discarded after inactivity.
_Avoid_: Session, tenant, instance

**Admin**:
An internal operator who oversees the marketplace, its Riders and its Drivers.
_Avoid_: Operator, moderator, superuser
