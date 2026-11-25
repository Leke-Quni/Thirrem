import type { Cancellation } from '@thirrem/types';

/** A cancel this soon after the match is a quick one, and any later one is late. */
const QUICK_FOR_MS = 30_000;
const WINDOW_MS = 30 * 60_000;
const PAUSE_MS = 15 * 60_000;
/** This many cancels of one kind within the window pause Ride Requests. */
const LIMITS = { quick: 5, late: 3 };

export type CountedCancel = keyof typeof LIMITS;

/** The counted cancels a Rider has made. It belongs to the account, so a new Sandbox does not clear it. */
export interface CancelHistory {
  cancels: Array<{ kind: CountedCancel; atMs: number }>;
  pausedUntilMs: number;
  /** When a cancel last left the Rider one more of its kind from a pause. */
  warnedAtMs: number | null;
}

export const NO_CANCELS: CancelHistory = { cancels: [], pausedUntilMs: 0, warnedAtMs: null };

/** The open Ride Request as far as cancelling it goes. */
export interface Cancelling {
  /** Undefined while still searching. */
  matchedAtMs: number | undefined;
  /** No route to the Pickup Point could be had, which is no fault of the Rider's. */
  routeUnavailable: boolean;
}

/** How cancelling at `nowMs` would count, or null if it would not. */
export function cancelKind({ matchedAtMs, routeUnavailable }: Cancelling, nowMs: number): CountedCancel | null {
  if (matchedAtMs === undefined || routeUnavailable) return null;
  return nowMs < matchedAtMs + QUICK_FOR_MS ? 'quick' : 'late';
}

const recent = ({ cancels }: CancelHistory, nowMs: number) => cancels.filter(({ atMs }) => nowMs - atMs < WINDOW_MS);

const countOf = (history: CancelHistory, kind: CountedCancel, nowMs: number) => recent(history, nowMs).filter((cancel) => cancel.kind === kind).length;

const pauses = (history: CancelHistory, kind: CountedCancel, nowMs: number) => countOf(history, kind, nowMs) + 1 >= LIMITS[kind];

export function withCancel(history: CancelHistory, kind: CountedCancel, nowMs: number): CancelHistory {
  const next = { ...history, cancels: [...recent(history, nowMs), { kind, atMs: nowMs }] };
  if (pauses(history, kind, nowMs)) return { ...next, pausedUntilMs: nowMs + PAUSE_MS };
  return pauses(next, kind, nowMs) ? { ...next, warnedAtMs: nowMs } : next;
}

/** The seconds until Ride Requests are allowed again, or null if they are now. */
export function pausedForS({ pausedUntilMs }: CancelHistory, nowMs: number): number | null {
  return nowMs < pausedUntilMs ? Math.ceil((pausedUntilMs - nowMs) / 1_000) : null;
}

/** What cancelling at `nowMs` would mean, as the Rider is told before doing it. */
export function cancellation(cancelling: Cancelling, history: CancelHistory, nowMs: number): Cancellation {
  const counts = cancelKind(cancelling, nowMs);
  return {
    counts,
    quickForS: counts === 'quick' ? Math.ceil((cancelling.matchedAtMs! + QUICK_FOR_MS - nowMs) / 1_000) : null,
    pausesRequests: counts !== null && pauses(history, counts, nowMs),
  };
}
