import { describe, expect, it } from 'vitest';
import { candidatePoints, chooseDrivers, distanceM } from '../src/sandbox/driver-placement.js';

const gjakova = { lat: 42.3803, lon: 20.4308 };

const seeded = (seed = 7) => () => {
  seed = (seed * 48271) % 2147483647;
  return seed / 2147483647;
};

const place = (centre = gjakova, snap?: (point: { lat: number; lon: number }, index: number) => { lat: number; lon: number }) => {
  const candidates = candidatePoints(centre, seeded());
  let id = 0;
  return chooseDrivers(centre, candidates, snap ? candidates.map(({ point }, index) => snap(point, index)) : null, () => `driver-${(id += 1)}`);
};

const inRing = (centre: { lat: number; lon: number }, fromM: number, toM: number) => (driver: { lat: number; lon: number }) => {
  const away = distanceM(centre, driver);
  return away >= fromM && away < toM;
};

/** About `metres` due north, which is 111,195 m per degree of latitude. */
const north = ({ lat, lon }: { lat: number; lon: number }, metres: number) => ({ lat: lat + metres / 111_195, lon });

describe('distanceM', () => {
  it('measures one degree of latitude as about 111 km', () => {
    expect(distanceM({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111_195, -1);
  });

  it('measures the short way across the date line', () => {
    expect(distanceM({ lat: 0, lon: 179.999 }, { lat: 0, lon: -179.999 })).toBeLessThan(250);
  });
});

describe('Placing simulated Drivers', () => {
  const rings = [
    { fromM: 0, toM: 1000, total: 20, perType: { economy: 8, comfort: 4, xl: 4, electric: 4 } },
    { fromM: 1000, toM: 4000, total: 12, perType: { economy: 5, comfort: 3, xl: 2, electric: 2 } },
    { fromM: 4000, toM: 10_000, total: 8, perType: { economy: 4, comfort: 2, xl: 1, electric: 1 } },
  ];

  it.each([
    ['in Gjakova', gjakova],
    ['near a pole', { lat: 89.99, lon: 20 }],
    ['on the date line', { lat: -17, lon: 179.999 }],
  ])('puts 40 Drivers %s, thinning out to 10 km', (_, centre) => {
    const drivers = place(centre);

    expect(drivers).toHaveLength(40);
    for (const { fromM, toM, total } of rings) expect(drivers.filter(inRing(centre, fromM, toM))).toHaveLength(total);
    for (const { lat, lon } of drivers) {
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(lon)).toBeLessThanOrEqual(180);
    }
  });

  it('makes more Drivers in every ring Economy than any other Vehicle Type', () => {
    const drivers = place();

    for (const { fromM, toM, perType } of rings) {
      const types = drivers.filter(inRing(gjakova, fromM, toM)).map((driver) => driver.vehicleType);
      for (const [type, count] of Object.entries(perType)) expect(types.filter((item) => item === type)).toHaveLength(count);
    }
  });

  it('gives each Driver its own id', () => {
    expect(new Set(place().map((driver) => driver.id)).size).toBe(40);
  });

  it('tries 200 candidate points, most of them out of town where streets are scarce', () => {
    const candidates = candidatePoints(gjakova, seeded());

    expect([0, 1, 2].map((ring) => candidates.filter((candidate) => candidate.ring === ring).length)).toEqual([50, 80, 70]);
  });

  it('prefers the candidates closest to a street, so Drivers lean towards built-up areas', () => {
    const close: Array<{ lat: number; lon: number }> = [];

    const drivers = place(gjakova, (point, index) => {
      if (index % 2) return north(point, 200);
      const road = north(point, 5);
      close.push(road);
      return road;
    });

    const fromClose = drivers.filter(({ lat, lon }) => close.some((road) => road.lat === lat && road.lon === lon));
    expect(fromClose.length).toBeGreaterThanOrEqual(36);
  });

  it('keeps Drivers beyond 1 km at least 500 m apart', () => {
    const outer = place().filter((driver) => distanceM(gjakova, driver) >= 1000);

    for (const [index, driver] of outer.entries()) {
      for (const other of outer.slice(index + 1)) expect(distanceM(driver, other)).toBeGreaterThanOrEqual(500);
    }
  });

  it('puts only one Driver in a village, however close to its streets the other candidates are', () => {
    const village = north(gjakova, 6000);
    const crowded = Array.from({ length: 10 }, (_, index) => ({ ring: 2, point: north(village, index * 20) }));
    const scattered = Array.from({ length: 10 }, (_, index) => ({ ring: 2, point: north(gjakova, -4500 - index * 550) }));
    const candidates = [...crowded, ...scattered];
    const onRoad = [...crowded.map(({ point }) => point), ...scattered.map(({ point }) => north(point, 30))];

    const drivers = chooseDrivers(gjakova, candidates, onRoad, () => 'id').filter((driver) => distanceM(gjakova, driver) >= 4000);

    expect(drivers).toHaveLength(8);
    expect(drivers.filter((driver) => distanceM(village, driver) < 500)).toHaveLength(1);
  });

  it('still places every Driver when there is no room to keep them apart', () => {
    const candidates = Array.from({ length: 20 }, () => ({ ring: 2, point: north(gjakova, 6000) }));

    expect(chooseDrivers(gjakova, candidates, null, () => 'id')).toHaveLength(8);
  });

  it('moves a Driver onto the road point near its candidate', () => {
    const snapped: Array<{ lat: number; lon: number }> = [];

    const drivers = place(gjakova, (point) => {
      const road = north(point, 5);
      snapped.push(road);
      return road;
    });

    const onRoad = drivers.filter(({ lat, lon }) => snapped.some((road) => road.lat === lat && road.lon === lon));
    expect(onRoad.length).toBeGreaterThanOrEqual(38);
    expect(drivers).toHaveLength(40);
  });

  it('skips a candidate whose nearest road is more than 250 m away', () => {
    const far: Array<{ lat: number; lon: number }> = [];

    const drivers = place(gjakova, (point, index) => {
      if (index % 2) return point;
      const road = north(point, 300);
      far.push(road);
      return road;
    });

    expect(drivers.some(({ lat, lon }) => far.some((road) => road.lat === lat && road.lon === lon))).toBe(false);
    expect(drivers).toHaveLength(40);
  });

  it('keeps the ring counts when the road points all fall outside their rings, using the points as they were', () => {
    const drivers = place(gjakova, () => north(gjakova, 20_000));

    for (const { fromM, toM, total } of rings) expect(drivers.filter(inRing(gjakova, fromM, toM))).toHaveLength(total);
  });
});
