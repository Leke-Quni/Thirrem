import type { SimulatedDriver } from '@thirrem/types';

/** The time between two sets of positions, so a car arrives as the next one is due. */
const GLIDE_MS = 1_000;
/** A car turns this many times faster than it travels, so it does not slide sideways round a corner. */
const TURN_SPEED = 4;
/** Further than any car drives in a second: it has been moved, not driven. */
const JUMP_M = 150;
const METRES_PER_DEGREE = 111_195;

export type Pose = Pick<SimulatedDriver, 'lat' | 'lon' | 'heading'>;

/** How a car stands in the Rider's open Ride Request. */
export type CarMark = 'offered' | 'matched';

export interface Car {
  moveTo(pose: Pose): void;
  mark(mark: CarMark | null): void;
  remove(): void;
}

interface FleetDependencies {
  createCar(pose: Pose): Car;
  requestFrame(draw: () => void): number;
  cancelFrame(frame: number): void;
  now(): number;
  reducedMotion(): boolean;
}

interface Tracked {
  car: Car;
  shown: Pose;
  target: Pose;
  glide: { from: Pose; startedAt: number } | null;
}

const apartM = (a: Pose, b: Pose) => Math.hypot(b.lat - a.lat, (b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180)) * METRES_PER_DEGREE;

function between(from: Pose, to: Pose, share: number): Pose {
  const turn = ((to.heading - from.heading + 540) % 360) - 180;
  return {
    lat: from.lat + (to.lat - from.lat) * share,
    lon: from.lon + (to.lon - from.lon) * share,
    // Not wrapped to 0–360, so the car never spins the long way round.
    heading: from.heading + turn * Math.min(1, share * TURN_SPEED),
  };
}

/** One car per simulated Driver, gliding between the positions it is told about. */
export class DriverFleet {
  private readonly cars = new Map<string, Tracked>();
  private frame: number | null = null;

  constructor(private readonly deps: FleetDependencies) {}

  show(drivers: SimulatedDriver[], marks: ReadonlyMap<string, CarMark> = new Map()): void {
    const gone = new Set(this.cars.keys());
    for (const { id, lat, lon, heading } of drivers) {
      gone.delete(id);
      const target = { lat, lon, heading };
      const tracked = this.cars.get(id);
      if (!tracked) this.cars.set(id, { car: this.deps.createCar(target), shown: target, target, glide: null });
      else this.send(tracked, target);
      this.cars.get(id)!.car.mark(marks.get(id) ?? null);
    }
    for (const id of gone) {
      this.cars.get(id)!.car.remove();
      this.cars.delete(id);
    }
    this.schedule();
  }

  clear(): void {
    this.show([]);
    if (this.frame !== null) this.deps.cancelFrame(this.frame);
    this.frame = null;
  }

  private send(tracked: Tracked, target: Pose): void {
    const { lat, lon, heading } = tracked.target;
    if (lat === target.lat && lon === target.lon && heading === target.heading) return;
    tracked.target = target;
    if (this.deps.reducedMotion() || apartM(tracked.shown, target) > JUMP_M) {
      tracked.glide = null;
      this.move(tracked, target);
    } else tracked.glide = { from: tracked.shown, startedAt: this.deps.now() };
  }

  private move(tracked: Tracked, pose: Pose): void {
    tracked.shown = pose;
    tracked.car.moveTo(pose);
  }

  private schedule(): void {
    if (this.frame !== null || ![...this.cars.values()].some((tracked) => tracked.glide)) return;
    this.frame = this.deps.requestFrame(() => this.draw());
  }

  private draw(): void {
    this.frame = null;
    const now = this.deps.now();
    for (const tracked of this.cars.values()) {
      if (!tracked.glide) continue;
      const share = Math.min(1, (now - tracked.glide.startedAt) / GLIDE_MS);
      this.move(tracked, between(tracked.glide.from, tracked.target, share));
      if (share === 1) tracked.glide = null;
    }
    this.schedule();
  }
}
