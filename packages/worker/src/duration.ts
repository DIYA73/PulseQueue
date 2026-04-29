const UNITS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

export function parseDuration(s: string): number {
  const match = s.match(/^(\d+)([smhdw])$/);
  if (!match) {
    throw new Error(`Invalid duration "${s}". Use: 30s, 5m, 2h, 1d, 1w`);
  }
  return parseInt(match[1], 10) * UNITS[match[2]];
}
