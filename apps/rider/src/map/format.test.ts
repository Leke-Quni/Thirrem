import { describe, expect, it } from 'vitest';
import { formatCountdown, formatDistance, formatDuration, formatFare } from './format';

describe('formatDistance', () => {
  it('shows metres under a kilometre, rounded to ten', () => {
    expect(formatDistance(847)).toBe('850 m');
  });
  it('shows kilometres with one decimal from a kilometre up', () => {
    expect(formatDistance(1850)).toBe('1.9 km');
  });
});

describe('formatDuration', () => {
  it('never shows less than one minute', () => {
    expect(formatDuration(20)).toBe('1 min');
  });
  it('rounds to whole minutes', () => {
    expect(formatDuration(241)).toBe('4 min');
  });
  it('switches to hours and minutes from an hour up', () => {
    expect(formatDuration(3900)).toBe('1 h 5 min');
  });
});

describe('formatFare', () => {
  it('shows euro cents as euros with two decimals', () => {
    expect(formatFare(210)).toBe('€2.10');
  });
  it('groups thousands', () => {
    expect(formatFare(123456)).toBe('€1,234.56');
  });
});

describe('formatCountdown', () => {
  it.each([
    [900, '15:00'],
    [61, '1:01'],
    [9, '0:09'],
  ])('shows %i seconds as %s', (seconds, text) => {
    expect(formatCountdown(seconds)).toBe(text);
  });
});
