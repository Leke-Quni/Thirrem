export interface HealthResponse {
  status: 'ok';
  database: 'up';
  simulationTime: string;
}

export interface RoadGraphSummary {
  nodes: number;
  edges: number;
}

export interface SessionResponse {
  email: string;
  token: string;
}

export interface MeResponse {
  email: string;
}

export interface RouteResponse {
  distanceM: number;
  durationS: number;
  geometry: Array<[number, number]>;
}

export interface Coordinate {
  lat: number;
  lon: number;
}

export interface PlaceResult {
  name: string;
  detail: string;
  lat: number;
  lon: number;
}

export interface StreetResponse {
  street: string | null;
}

export type VehicleType = 'economy' | 'comfort' | 'xl' | 'electric';

export interface Fare {
  amountCents: number;
  currency: 'EUR';
}

export interface FareQuote extends Fare {
  vehicleType: VehicleType;
}

/** What a Fare is made of, in euro cents. */
export interface FareBreakdown {
  baseCents: number;
  distanceCents: number;
  timeCents: number;
  /** What the kilometres past the long-distance threshold add. */
  longDistanceCents: number;
}

export interface FareResponse {
  distanceM: number;
  durationS: number;
  fares: FareQuote[];
}

export interface SimulatedDriver extends Coordinate {
  id: string;
  vehicleType: VehicleType;
  /** The direction the vehicle faces, in degrees clockwise from north. */
  heading: number;
  /** False while matched to a Ride Request. */
  available: boolean;
}

export interface SandboxResponse {
  drivers: SimulatedDriver[];
  /** The open Ride Request, if the Rider has one. */
  rideRequest: RideRequest | null;
  /** The Rider's Ride, from pickup on. The Ride Request it came from is then no longer sent. */
  ride: Ride | null;
  /** The seconds until the Rider can request a Ride again after cancelling too often, or null if they can now. */
  requestsPausedForS: number | null;
  /** When a cancel last left the Rider one more of its kind from a pause, for the app to warn them as it changes. Null if none has. */
  cancelWarningAtMs: number | null;
}

/** Failed once every accept window has passed with no Driver accepting. It is then closed. */
export type RideRequestStatus = 'searching' | 'matched' | 'failed';

/** What a Driver the Ride Request was broadcast to has done with it. */
export interface RideRequestOffer {
  driverId: string;
  /** Withdrawn once another Driver has accepted, or the Ride Request has failed. */
  status: 'offered' | 'accepted' | 'withdrawn';
}

export interface RideRequest {
  id: string;
  vehicleType: VehicleType;
  pickup: Coordinate;
  dropoff: Coordinate;
  status: RideRequestStatus;
  offers: RideRequestOffer[];
  /** The matched Driver, or null if none is. */
  driver: MatchedDriver | null;
  /** The matched Driver's drive to the Pickup Point, or null while searching. */
  approach: DriveProgress | null;
  /** What cancelling it now would mean, or null once it has failed. `DELETE /rider/ride-requests` cancels it, with `?pause=accepted` if the Rider has agreed to be paused. */
  cancellation: Cancellation | null;
}

export interface Cancellation {
  /** Which limit it would count toward: quick within 30 seconds of the match, late after. Null when it would not count. */
  counts: 'quick' | 'late' | null;
  /** The seconds until a quick cancel would be a late one. */
  quickForS: number | null;
  /** Whether it would pause Ride Requests for 15 minutes. */
  pausesRequests: boolean;
}

/** The 409 answer to a cancel that would pause Ride Requests and was sent without `?pause=accepted`. */
export interface CancelWouldPauseResponse {
  code: 'CANCEL_WOULD_PAUSE';
  message: string;
}

/** The 429 answer to requesting a Ride while paused for cancelling too often. */
export interface RideRequestsPausedResponse {
  code: 'RIDE_REQUESTS_PAUSED';
  message: string;
}

/** The journey from pickup to drop-off. */
export interface Ride {
  /** That of the Ride Request it came from. */
  id: string;
  vehicleType: VehicleType;
  pickup: Coordinate;
  dropoff: Coordinate;
  driver: MatchedDriver;
  /** The drive to the Drop-off Point. */
  progress: DriveProgress;
  /** Whether the Rider has asked the Driver to end the Ride early. */
  endRequested: boolean;
  /** What the Rider pays, set once the Ride has completed. */
  finalFare: Fare | null;
}

/** How far the Driver is with a drive: the one to the Pickup Point, or the Ride's to the Drop-off Point. */
export type DriveProgress =
  /** The road route is still being looked for, and the Driver waits where it was matched. */
  | { status: 'routing' }
  /** No route could be had. `POST /rider/ride-requests/approach` or `POST /rider/rides/route` looks for one again. */
  | { status: 'unavailable' }
  /** `geometry` is the road still ahead, starting where the Driver is. `etaS` is the seconds until it reaches the end of it. */
  | { status: 'driving'; geometry: Array<[number, number]>; etaS: number }
  /** The Driver is at the end of the route. */
  | { status: 'arrived' };

export interface MatchedDriver {
  id: string;
  name: string;
  /** Out of 5. */
  rating: number;
  vehicle: { model: string; colour: string; plate: string };
}

/** The 503 answer to opening a Sandbox when as many as are allowed are already running. */
export interface SandboxBusyResponse {
  code: 'SANDBOX_LIMIT';
  message: string;
}

/** What the live feed at `/rider/live` sends, after being told `{ event: 'watch', data: { token } }`. */
export interface SandboxLiveMessage {
  event: 'drivers';
  data: SandboxResponse;
}

/** Why the live feed closes: an unknown session, no Sandbox to watch, no token sent in time, or a stopped Sandbox. */
export type SandboxLiveCloseCode = 4401 | 4404 | 4408 | 4410;

export type Wallet = 'apple_pay' | 'google_pay';

export interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  /** The wallet the card was saved through, if it was not typed in. */
  wallet: Wallet | null;
  isDefault: boolean;
}

export interface PaymentMethodsResponse {
  /** The key Stripe's card form is shown with, or null when payments are not set up. */
  publishableKey: string | null;
  methods: PaymentMethod[];
}

/** The 402 answer to a Ride Request whose quoted Fare could not be held. Nobody has been asked to take it. */
export type PaymentRefusedResponse =
  | { code: 'PAYMENT_METHOD_REQUIRED' | 'PAYMENT_DECLINED' | 'FARE_UNPAID'; message: string }
  /** The Rider's bank has to verify them first. The app does that with `clientSecret`, then sends the request again with `holdId`, whether or not it passed. */
  | { code: 'PAYMENT_VERIFICATION'; message: string; holdId: string; clientSecret: string; publishableKey: string };

/** A Fare that is due for a Ride and could not be charged. No Ride can be requested until it is paid. */
export interface UnpaidFare extends Fare {
  id: string;
  vehicleType: VehicleType;
  pickupName: string;
  dropoffName: string;
  /** When the Ride was requested. */
  requestedAt: string;
}

export interface UnpaidFaresResponse {
  fares: UnpaidFare[];
}

/** What a Rider paid for a Ride. `amountCents` is the total charged. */
export interface Receipt extends Fare {
  id: string;
  /** That of the Ride it is for. */
  rideId: string;
  /** When the Ride was requested. */
  requestedAt: string;
  vehicleType: VehicleType;
  pickupName: string;
  dropoffName: string;
  /** How far the Ride went, and how long it took. */
  distanceM: number;
  durationS: number;
  breakdown: FareBreakdown;
  /** What was taken off `breakdown` so as not to charge more than the quoted Fare: 0 or less. With it, the breakdown adds up to `amountCents`. */
  adjustmentCents: number;
  paymentMethod: Pick<PaymentMethod, 'brand' | 'last4' | 'wallet'>;
}

/** A page of receipts, newest Ride first. */
export interface ReceiptsResponse {
  receipts: Receipt[];
  /** How many there are in all. */
  total: number;
  /** Sent as `?after=` for the next page, or null on the last one. */
  next: string | null;
}

export interface CardSetupResponse {
  clientSecret: string;
}
