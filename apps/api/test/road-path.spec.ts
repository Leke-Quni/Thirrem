import { describe, expect, it } from 'vitest';
import { roadPath } from '../src/sandbox/road-path.js';

const METRE = 1 / 111_195;
const corner = { lat: 0, lon: 0 };
const north = { lat: 100 * METRE, lon: 0 };
const northEast = { lat: 100 * METRE, lon: 100 * METRE };
// A closed loop: 100 m north, 100 m east, then back across the diagonal.
const loop = () => roadPath({ points: [corner, north, northEast, corner], durationS: 34.142 })!;

describe('A road path', () => {
  it('starts at its first point, facing along the first stretch', () => {
    const at = loop().at(0);

    expect(at.lat).toBeCloseTo(0, 7);
    expect(at.lon).toBeCloseTo(0, 7);
    expect(at.heading).toBeCloseTo(0, 0);
  });

  it('moves along its stretches and turns with them', () => {
    const at = loop().at(150);

    expect(at.lat).toBeCloseTo(100 * METRE, 7);
    expect(at.lon).toBeCloseTo(50 * METRE, 7);
    expect(at.heading).toBeCloseTo(90, 0);
  });

  it('faces south-west on the way back', () => {
    expect(loop().at(250).heading).toBeCloseTo(225, 0);
  });

  it('starts over after a full lap', () => {
    const path = loop();

    const again = path.at(path.lengthM + 50);

    expect(again.lat).toBeCloseTo(path.at(50).lat, 7);
    expect(again.lon).toBeCloseTo(path.at(50).lon, 7);
  });

  it('is driven at the average speed of the route', () => {
    expect(loop().speedMps).toBeCloseTo(10, 1);
  });

  it('skips repeated points, which have no direction', () => {
    const path = roadPath({ points: [corner, corner, north, north, corner], durationS: 20 })!;

    expect(path.at(0).heading).toBeCloseTo(0, 0);
    expect(path.at(150).heading).toBeCloseTo(180, 0);
  });

  it('refuses a route too short to drive or with no duration', () => {
    expect(roadPath({ points: [corner, { lat: 5 * METRE, lon: 0 }, corner], durationS: 2 })).toBeNull();
    expect(roadPath({ points: [corner, north, corner], durationS: 0 })).toBeNull();
    expect(roadPath({ points: [corner], durationS: 10 })).toBeNull();
  });
});
