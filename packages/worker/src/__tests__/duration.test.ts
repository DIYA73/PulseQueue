import { describe, it, expect } from 'vitest';
import { parseDuration } from '../duration.js';

describe('parseDuration', () => {
  it.each([
    ['1s',   1_000],
    ['30s',  30_000],
    ['1m',   60_000],
    ['5m',   300_000],
    ['1h',   3_600_000],
    ['2h',   7_200_000],
    ['1d',   86_400_000],
    ['7d',   604_800_000],
    ['1w',   604_800_000],
    ['2w',   1_209_600_000],
  ])('parseDuration("%s") === %i ms', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it.each([
    '2hours',
    '1 h',
    'abc',
    '',
    '10',
    'h10',
    '1y',
  ])('throws on invalid input "%s"', input => {
    expect(() => parseDuration(input)).toThrow('Invalid duration');
  });
});
