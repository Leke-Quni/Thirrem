import type { SimulatedDriver } from '@thirrem/types';
import { describe, expect, it } from 'vitest';
import { DriverFleet, type Pose } from './driver-fleet';

const METRE = 1 / 111_195;
const driver = (id: string, northM = 0, heading = 0): SimulatedDriver => ({ id, vehicleType: 'economy', heading, lat: northM * METRE, lon: 0 });

function fleet({ reducedMotion = false } = {}) {
  const cars: Array<{ pose: Pose; removed: boolean }> = [];
  let time = 0;
  let frames: Array<() => void> = [];
  const subject = new DriverFleet({
    createCar: (pose) => {
      const car = { pose, removed: false };
      cars.push(car);
      return { moveTo: (next) => (car.pose = next), remove: () => (car.removed = true) };
    },
    requestFrame: (draw) => frames.push(draw),
    cancelFrame: () => (frames = []),
    now: () => time,
    reducedMotion: () => reducedMotion,
  });
  /** Moves time on and draws the frame the fleet asked for. */
  const after = (ms: number) => {
    time += ms;
    for (const draw of frames.splice(0)) draw();
  };
  return { subject, cars, after, waiting: () => frames.length };
}

const metresNorth = (pose: Pose) => pose.lat / METRE;

describe('DriverFleet', () => {
  it('puts a car on the map for each Driver, facing its heading', () => {
    const { subject, cars } = fleet();

    subject.show([driver('a', 0, 90), driver('b', 20)]);

    expect(cars.map((car) => car.pose.heading)).toEqual([90, 0]);
  });

  it('glides a car to its next position over one second', () => {
    const { subject, cars, after, waiting } = fleet();
    subject.show([driver('a')]);

    subject.show([driver('a', 10)]);
    expect(metresNorth(cars[0]!.pose)).toBeCloseTo(0);
    after(500);
    expect(metresNorth(cars[0]!.pose)).toBeCloseTo(5);
    after(700);

    expect(metresNorth(cars[0]!.pose)).toBeCloseTo(10);
    expect(cars).toHaveLength(1);
    expect(waiting()).toBe(0);
  });

  it('carries on from where the car is when the next position arrives early', () => {
    const { subject, cars, after } = fleet();
    subject.show([driver('a')]);
    subject.show([driver('a', 10)]);
    after(500);

    subject.show([driver('a', 25)]);
    after(500);

    expect(metresNorth(cars[0]!.pose)).toBeCloseTo(15);
  });

  it('turns the short way round, and has turned before it arrives', () => {
    const { subject, cars, after } = fleet();
    subject.show([driver('a', 0, 350)]);

    subject.show([driver('a', 10, 30)]);
    after(125);
    expect(cars[0]!.pose.heading % 360).toBeCloseTo(10);
    after(375);

    expect(cars[0]!.pose.heading % 360).toBeCloseTo(30);
  });

  it('jumps instead of gliding across a long distance', () => {
    const { subject, cars, waiting } = fleet();
    subject.show([driver('a')]);

    subject.show([driver('a', 500)]);

    expect(metresNorth(cars[0]!.pose)).toBeCloseTo(500);
    expect(waiting()).toBe(0);
  });

  it('moves cars without gliding when the visitor asks for less motion', () => {
    const { subject, cars, waiting } = fleet({ reducedMotion: true });
    subject.show([driver('a')]);

    subject.show([driver('a', 10, 45)]);

    expect(metresNorth(cars[0]!.pose)).toBeCloseTo(10);
    expect(cars[0]!.pose.heading).toBe(45);
    expect(waiting()).toBe(0);
  });

  it('asks for no frames while every Driver is parked', () => {
    const { subject, waiting } = fleet();
    subject.show([driver('a')]);

    subject.show([driver('a')]);

    expect(waiting()).toBe(0);
  });

  it('removes the cars of Drivers that are gone', () => {
    const { subject, cars } = fleet();
    subject.show([driver('a'), driver('b')]);

    subject.show([driver('b'), driver('c')]);

    expect(cars.map((car) => car.removed)).toEqual([true, false, false]);
  });

  it('removes every car and stops drawing when cleared', () => {
    const { subject, cars, waiting } = fleet();
    subject.show([driver('a')]);
    subject.show([driver('a', 10)]);

    subject.clear();

    expect(cars[0]!.removed).toBe(true);
    expect(waiting()).toBe(0);
  });
});
