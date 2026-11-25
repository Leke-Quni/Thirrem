import type { SimulatedDriver } from '@thirrem/types';
import type { Area } from './area.js';
import type { RoadPath } from './road-path.js';

type Random = () => number;

const SLOWEST_PACE = 0.85;
const PACE_RANGE = 0.3;

export interface SandboxDriver {
  id: string;
  station: number;
  /** This Driver's share of the path's average speed, so that Drivers on one path drift apart. */
  pace: number;
  /** Set when a path was ready as the Sandbox opened: the Driver starts part of the way round it. */
  joined: { path: RoadPath; startM: number; atMs: number } | null;
}

export function sandboxDriver(id: string, station: number, area: Area, nowMs: number, random: Random): SandboxDriver {
  const ready = area.paths.flatMap((path) => (path.station === station && path.ready ? [path.ready.path] : []));
  const path = ready[Math.floor(random() * ready.length)];
  const joined = path ? { path, startM: random() * path.lengthM, atMs: nowMs } : null;
  return { id, station, pace: SLOWEST_PACE + random() * PACE_RANGE, joined };
}

function firstReady(area: Area, station: number) {
  const ready = area.paths.flatMap((path) => (path.station === station && path.ready ? [path.ready] : []));
  const first = ready.sort((a, b) => a.atMs - b.atMs)[0];
  return first && { ...first, startM: 0 };
}

/** The Driver as it is at `nowMs`: driving its path, or parked while it has none. */
export function driverAt({ id, station, pace, joined }: SandboxDriver, area: Area, nowMs: number): SimulatedDriver {
  const parked = area.stations[station]!;
  const drive = joined ?? firstReady(area, station);
  if (!drive) return { id, ...parked };
  const metres = drive.startM + (Math.max(0, nowMs - drive.atMs) / 1_000) * drive.path.speedMps * pace;
  return { id, vehicleType: parked.vehicleType, ...drive.path.at(metres) };
}
