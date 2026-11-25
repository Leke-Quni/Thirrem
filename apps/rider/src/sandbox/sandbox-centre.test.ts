import { describe, expect, it } from 'vitest';
import { movedAway, sandboxCentre } from './sandbox-centre';

const gjakova = { lat: 42.3803, lon: 20.4308 };
const london = { lat: 51.5072, lon: -0.1276 };
const nearLondon = { lat: 51.55, lon: -0.1276 };
const paris = { lat: 48.8566, lon: 2.3522 };

describe('sandboxCentre', () => {
  it('waits while the location is being found and no Pickup Point is set', () => {
    expect(sandboxCentre({ status: 'finding' }, null)).toBeNull();
  });

  it('uses a Pickup Point set before the location is found', () => {
    expect(sandboxCentre({ status: 'finding' }, paris)).toEqual(paris);
  });

  it('is the device location once found', () => {
    expect(sandboxCentre({ status: 'found', point: london }, null)).toEqual(london);
  });

  it('stays at the device location for a Pickup Point within 10 km of it', () => {
    expect(sandboxCentre({ status: 'found', point: london }, nearLondon)).toEqual(london);
  });

  it('moves to a Pickup Point more than 10 km from the device location', () => {
    expect(sandboxCentre({ status: 'found', point: london }, paris)).toEqual(paris);
  });

  it('is Gjakova when the location is unavailable and no Pickup Point is set', () => {
    expect(sandboxCentre({ status: 'unavailable' }, null)).toEqual(gjakova);
  });

  it('follows the Pickup Point when the location is unavailable', () => {
    expect(sandboxCentre({ status: 'unavailable' }, paris)).toEqual(paris);
  });
});

describe('movedAway', () => {
  it('ignores a move of less than 1 km', () => {
    expect(movedAway(london, { ...london, lat: london.lat + 0.008 })).toBe(false);
  });

  it('notices a move of more than 1 km', () => {
    expect(movedAway(london, { ...london, lat: london.lat + 0.01 })).toBe(true);
  });
});
