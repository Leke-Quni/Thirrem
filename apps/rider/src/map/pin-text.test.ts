import { describe, expect, it } from 'vitest';
import { pinText } from './pin-text';

const point = { lat: 42.3803, lon: 20.4308 };

describe('pinText', () => {
  it('shows the street name when the map has one for the pin', () => {
    expect(pinText(point, { state: 'done', name: 'Nëna Terezë, Gjakova' })).toBe('Nëna Terezë, Gjakova');
  });

  it('does not flash the coordinates while the street name is still being looked up', () => {
    expect(pinText(point, { state: 'loading' })).toBe('Finding the street name…');
  });

  it('shows the point itself only once the map is known to have no street name there', () => {
    expect(pinText(point, { state: 'done', name: null })).toBe('42.38030, 20.43080');
  });

  it('keeps the name of a place the Rider searched for, even when a street is known or loading', () => {
    const named = { ...point, label: 'Hospital, Gjakovë, Kosovo' };

    expect(pinText(named, { state: 'done', name: 'Nëna Terezë, Gjakova' })).toBe('Hospital, Gjakovë, Kosovo');
    expect(pinText(named, { state: 'loading' })).toBe('Hospital, Gjakovë, Kosovo');
  });

  it('shows nothing only when there is no pin at all', () => {
    expect(pinText(null, { state: 'done', name: null })).toBe('');
  });

  it('keeps the sign of coordinates west and south of zero', () => {
    expect(pinText({ lat: -33.8688, lon: -70.6693 }, { state: 'done', name: null })).toBe('-33.86880, -70.66930');
  });
});
