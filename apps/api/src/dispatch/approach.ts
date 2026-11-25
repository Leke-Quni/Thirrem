import type { Approach } from '@thirrem/types';
import type { RouteResult } from '../routing/routing.service.js';
import { oneWayPath, type PathPosition } from '../sandbox/road-path.js';

/** The matched Driver's drive to the Pickup Point, as a Sandbox keeps it. */
export interface StoredApproach {
  /** Where the Driver is as it is matched, which is where its route starts. */
  from: PathPosition;
  matchedAtMs: number;
  /** Null while a road route is being looked for. */
  route: Drive | 'unavailable' | null;
}

/** A route being driven: since `atMs`, on top of the `beforeS` driven before the Sandbox last stopped. */
type Drive = RouteResult & { atMs: number; beforeS: number };

/** The approach once the search for its route has ended. `found` is null when there is none to be had. */
export const approachRouted = (approach: StoredApproach, found: RouteResult | null, nowMs: number): StoredApproach => ({
  ...approach,
  route: found ? { ...found, atMs: nowMs, beforeS: 0 } : 'unavailable',
});

/** A route found while the Sandbox was stopped is only set off along once it is running again. */
const setOffAtMs = ({ matchedAtMs }: StoredApproach, { atMs }: Drive, resumedAtMs: number) => Math.max(atMs, matchedAtMs, resumedAtMs);

const drivenS = (approach: StoredApproach, drive: Drive, resumedAtMs: number, nowMs: number) =>
  drive.beforeS + Math.max(0, nowMs - setOffAtMs(approach, drive, resumedAtMs)) / 1_000;

const pathOf = ({ geometry }: Drive) => oneWayPath(geometry.map(([lon, lat]) => ({ lat, lon })));

/** Where the matched Driver is at `nowMs`: on its way, or where it was matched while it has no route. */
export function approachPosition(approach: StoredApproach, resumedAtMs: number, nowMs: number): PathPosition {
  const { from, route } = approach;
  if (!route || route === 'unavailable') return from;
  return pathOf(route)?.at(drivenS(approach, route, resumedAtMs, nowMs) / route.durationS) ?? from;
}

/** The approach as the Rider is told of it. */
export function approachView(approach: StoredApproach, resumedAtMs: number, nowMs: number): Approach {
  const { route } = approach;
  if (!route) return { status: 'routing' };
  if (route === 'unavailable') return { status: 'unavailable' };
  const driven = drivenS(approach, route, resumedAtMs, nowMs);
  const leftS = route.durationS - driven;
  if (leftS <= 0) return { status: 'arrived' };
  const ahead = pathOf(route)?.ahead(driven / route.durationS);
  return { status: 'driving', geometry: ahead?.map(({ lat, lon }) => [lon, lat]) ?? route.geometry, etaS: Math.ceil(leftS) };
}

/** The approach of a Sandbox that stopped at `stoppedMs`, set to carry on at `nowMs` from where it was. */
export function resumedApproach(approach: StoredApproach, resumedAtMs: number, stoppedMs: number, nowMs: number): StoredApproach {
  const { route } = approach;
  if (!route || route === 'unavailable' || setOffAtMs(approach, route, resumedAtMs) > stoppedMs) return approach;
  return { ...approach, route: { ...route, beforeS: drivenS(approach, route, resumedAtMs, stoppedMs), atMs: nowMs } };
}
