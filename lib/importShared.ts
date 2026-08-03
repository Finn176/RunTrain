// Shared constants/helpers for the run-history CSV importers (Strava, Garmin
// Connect, and any future source). Kept in one place so the sanity bounds
// stay consistent across importers.

export const MIN_DISTANCE_KM = 0.1;
export const MAX_DISTANCE_KM = 400; // generous ultra-marathon ceiling
export const MIN_DURATION_MIN = 1;
export const MAX_DURATION_MIN = 2000; // ~33 hours

export const KM_PER_MILE = 1.60934;

export function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

export function isPlausibleDistanceKm(km: number): boolean {
  return km >= MIN_DISTANCE_KM && km <= MAX_DISTANCE_KM;
}

export function isPlausibleDurationMin(min: number): boolean {
  return min >= MIN_DURATION_MIN && min <= MAX_DURATION_MIN;
}
