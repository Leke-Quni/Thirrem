import type { DriveProgress } from '@thirrem/types';
import type { RouteResult } from '../routing/routing.service.js';
import { oneWayPath, type PathPosition } from '../sandbox/road-path.js';

/** A route driven once, as a Sandbox keeps it. Null while a road route is being looked for. */
export type DriveRoute = DrivenRoute | 'unavailable' | null;

/** Driven since `atMs`, on top of the `beforeS` driven before the Sandbox last stopped. */
type DrivenRoute = RouteResult & {
  atMs: number;
  beforeS: number;
  /** How far into the route, in driving time, the vehicle stops for good, short of its end. */
  stopAtS?: number;
};

/** The route once the search for it has ended. `found` is null when there is none to be had. */
export const routed = (found: RouteResult | null, nowMs: number): DriveRoute => (found ? { ...found, atMs: nowMs, beforeS: 0 } : 'unavailable');

const isDriven = (route: DriveRoute): route is DrivenRoute => route !== null && route !== 'unavailable';

/** A drive due to start at `startsAtMs`. A route found while the Sandbox was stopped is only set off along once it is running again. */
const setOffAtMs = ({ atMs }: DrivenRoute, startsAtMs: number, resumedAtMs: number) => Math.max(atMs, startsAtMs, resumedAtMs);

const drivenS = (route: DrivenRoute, startsAtMs: number, resumedAtMs: number, nowMs: number) =>
  Math.min(route.beforeS + Math.max(0, nowMs - setOffAtMs(route, startsAtMs, resumedAtMs)) / 1_000, route.stopAtS ?? Infinity);

const pathOf = ({ geometry }: DrivenRoute) => oneWayPath(geometry.map(([lon, lat]) => ({ lat, lon })));

/** When the end of the route will have been reached and `waitMs` more has passed, or undefined while there is no route to drive. */
export function driveEndsAtMs(route: DriveRoute, startsAtMs: number, resumedAtMs: number, waitMs: number): number | undefined {
  if (!isDriven(route)) return undefined;
  return setOffAtMs(route, startsAtMs, resumedAtMs) + (route.durationS - route.beforeS) * 1_000 + waitMs;
}

/** Where the Driver is on the route at `nowMs`, or null while it has no route to be on. */
export function drivePosition(route: DriveRoute, startsAtMs: number, resumedAtMs: number, nowMs: number): PathPosition | null {
  if (!isDriven(route)) return null;
  return pathOf(route)?.at(drivenS(route, startsAtMs, resumedAtMs, nowMs) / route.durationS) ?? null;
}

/** Where the route ends, or null if there is none. */
export const driveEnd = (route: DriveRoute): PathPosition | null => (isDriven(route) ? (pathOf(route)?.at(1) ?? null) : null);

/** The route, once it has been driven to its end by `nowMs`. */
export function drivenRoute(route: DriveRoute, startsAtMs: number, resumedAtMs: number, nowMs: number): RouteResult | undefined {
  return isDriven(route) && drivenS(route, startsAtMs, resumedAtMs, nowMs) >= route.durationS ? route : undefined;
}

/** The route, set to be stopped on once `afterS` more of it has been driven, or at its end if that comes first. */
export function stoppingDrive(route: DriveRoute, startsAtMs: number, resumedAtMs: number, nowMs: number, afterS: number): DriveRoute {
  if (!isDriven(route)) return route;
  return { ...route, stopAtS: Math.min(route.durationS, drivenS(route, startsAtMs, resumedAtMs, nowMs) + afterS) };
}

/** What was travelled of a route that was to be stopped on, once the stop has been reached by `nowMs`. */
export function stoppedDrive(route: DriveRoute, startsAtMs: number, resumedAtMs: number, nowMs: number): RouteResult | undefined {
  if (!isDriven(route) || route.stopAtS === undefined || drivenS(route, startsAtMs, resumedAtMs, nowMs) < route.stopAtS) return undefined;
  // The vehicle covers the route at a steady speed, so the distance is the same share of it as the time.
  return { ...route, distanceM: (route.distanceM * route.stopAtS) / route.durationS, durationS: route.stopAtS };
}

/** The drive as the Rider is told of it at `nowMs`. */
export function driveProgress(route: DriveRoute, startsAtMs: number, resumedAtMs: number, nowMs: number): DriveProgress {
  if (!route) return { status: 'routing' };
  if (route === 'unavailable') return { status: 'unavailable' };
  const driven = drivenS(route, startsAtMs, resumedAtMs, nowMs);
  const leftS = route.durationS - driven;
  if (leftS <= 0 || driven === route.stopAtS) return { status: 'arrived' };
  const ahead = pathOf(route)?.ahead(driven / route.durationS);
  return { status: 'driving', geometry: ahead?.map(({ lat, lon }) => [lon, lat]) ?? route.geometry, etaS: Math.ceil(leftS) };
}

/** The drive of a Sandbox that stopped at `stoppedMs`, set to carry on at `nowMs` from where it was. */
export function resumedDrive(route: DriveRoute, startsAtMs: number, resumedAtMs: number, stoppedMs: number, nowMs: number): DriveRoute {
  if (!isDriven(route) || setOffAtMs(route, startsAtMs, resumedAtMs) > stoppedMs) return route;
  return { ...route, beforeS: drivenS(route, startsAtMs, resumedAtMs, stoppedMs), atMs: nowMs };
}
