import type { SimulatedDriver } from '@thirrem/types';
import type { Area } from './area.js';
import { type DriverProfile, driverProfile } from './driver-profile.js';
import type { RoadPath } from './road-path.js';

type Random = () => number;

const SLOWEST_PACE = 0.85;
const PACE_RANGE = 0.3;

export interface SandboxDriver {
  id: string;
  station: number;
  profile: DriverProfile;
  /** This Driver's share of the path's average speed, so that Drivers on one path drift apart. */
  pace: number;
  /** Set when a path was ready as the Sandbox opened, or when it resumed: the Driver starts part of the way round it. */
  joined: { path: RoadPath; startM: number; atMs: number } | null;
}

export function sandboxDriver(id: string, station: number, area: Area, nowMs: number, random: Random): SandboxDriver {
  const ready = area.paths.flatMap((path) => (path.station === station && path.ready ? [path.ready.path] : []));
  const path = ready[Math.floor(random() * ready.length)];
  const joined = path ? { path, startM: random() * path.lengthM, atMs: nowMs } : null;
  const profile = driverProfile(area.stations[station]!.vehicleType, random);
  return { id, station, profile, pace: SLOWEST_PACE + random() * PACE_RANGE, joined };
}

type Drive = NonNullable<SandboxDriver['joined']>;

/** The path the Driver is on and where it set off from, or nothing while no path of its station is ready. */
function driveOf({ station, joined }: SandboxDriver, area: Area, resumedAtMs: number): Drive | undefined {
  if (joined) return joined;
  const ready = area.paths.flatMap((path) => (path.station === station && path.ready ? [path.ready] : []));
  const first = ready.sort((a, b) => a.atMs - b.atMs)[0];
  // A path that arrived while the Sandbox was stopped is only set off along once it is running again.
  return first && { path: first.path, startM: 0, atMs: Math.max(first.atMs, resumedAtMs) };
}

const metresAlong = ({ path, startM, atMs }: Drive, pace: number, nowMs: number) => startM + (Math.max(0, nowMs - atMs) / 1_000) * path.speedMps * pace;

/** The Driver as it is at `nowMs`: driving its path, or parked while it has none. */
export function driverAt(driver: SandboxDriver, area: Area, resumedAtMs: number, nowMs: number): Omit<SimulatedDriver, 'available'> {
  const parked = area.stations[driver.station]!;
  const drive = driveOf(driver, area, resumedAtMs);
  if (!drive) return { id: driver.id, ...parked };
  return { id: driver.id, vehicleType: parked.vehicleType, ...drive.path.at(metresAlong(drive, driver.pace, nowMs)) };
}

/** The Driver of a Sandbox that stopped at `stoppedMs`, set to carry on at `nowMs` from where it was. */
export function resumedDriver(driver: SandboxDriver, area: Area, resumedAtMs: number, stoppedMs: number, nowMs: number): SandboxDriver {
  const drive = driveOf(driver, area, resumedAtMs);
  if (!drive || drive.atMs > stoppedMs) return { ...driver, joined: null };
  return { ...driver, joined: { path: drive.path, startM: metresAlong(drive, driver.pace, stoppedMs), atMs: nowMs } };
}
