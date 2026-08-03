// Centralized unit conversion + display formatting for distance, pace, and
// elevation. Every distance/pace/elevation is stored internally in
// km/min-per-km/meters, regardless of what a user has chosen to see — this
// module is the *only* place that converts to a user's preferred display
// unit. Before this existed, pace/duration formatting was independently
// duplicated across ~6 files; anything that displays or accepts a
// distance/pace/elevation value should import from here instead of writing
// its own formatter.

import { KM_PER_MILE } from "./importShared";

export type UnitPreference = "km" | "mi";

const M_PER_FOOT = 0.3048;
const FEET_PER_METER = 1 / M_PER_FOOT; // ~3.28084

export function kmToMi(km: number): number {
  return km / KM_PER_MILE;
}

export function miToKm(mi: number): number {
  return mi * KM_PER_MILE;
}

export function metersToFeet(m: number): number {
  return m * FEET_PER_METER;
}

// Converts a stored km value to the raw (unrounded) number in the user's
// preferred unit — useful when you need the number itself (e.g. to
// pre-fill a form input) rather than a formatted string.
export function displayDistance(km: number, unit: UnitPreference): number {
  return unit === "mi" ? kmToMi(km) : km;
}

// The reverse: converts a value the user typed in their preferred unit back
// to km, for storage or API submission. Every write path (logging a run,
// setting starting weekly mileage) must pass through this before the value
// reaches an API route.
export function toKm(value: number, unit: UnitPreference): number {
  return unit === "mi" ? miToKm(value) : value;
}

export function distanceUnitLabel(unit: UnitPreference): string {
  return unit === "mi" ? "mi" : "km";
}

export function paceUnitSuffix(unit: UnitPreference): string {
  return unit === "mi" ? "/mi" : "/km";
}

// e.g. "min/km" or "min/mi" — for chart axis labels and section headings.
export function paceUnitHeading(unit: UnitPreference): string {
  return unit === "mi" ? "min/mi" : "min/km";
}

export function formatDistance(km: number, unit: UnitPreference, decimals = 2): string {
  const value = displayDistance(km, unit);
  const factor = Math.pow(10, decimals);
  const rounded = Math.round(value * factor) / factor;
  return `${rounded}${distanceUnitLabel(unit)}`;
}

// minPerKm is always the stored/canonical pace unit (minutes per km).
// Returns just "M:SS" with no unit suffix — use formatPace() below when you
// want the suffix included.
export function formatPaceValue(minPerKm: number, unit: UnitPreference): string {
  const minPerUnit = unit === "mi" ? minPerKm * KM_PER_MILE : minPerKm;
  const totalSeconds = Math.round(minPerUnit * 60);
  const min = Math.floor(totalSeconds / 60);
  const sec = (totalSeconds % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

export function formatPace(minPerKm: number, unit: UnitPreference): string {
  return `${formatPaceValue(minPerKm, unit)}${paceUnitSuffix(unit)}`;
}

// A pace range, e.g. "5:30-5:50/km" (or the mile equivalent).
export function formatPaceRange(loMinPerKm: number, hiMinPerKm: number, unit: UnitPreference): string {
  return `${formatPaceValue(loMinPerKm, unit)}-${formatPaceValue(hiMinPerKm, unit)}${paceUnitSuffix(unit)}`;
}

// Convenience for the common case of a logged run: derives pace directly
// from distance + duration and formats it, guarding the zero-distance case.
export function paceFromDistanceDuration(distanceKm: number, durationMin: number, unit: UnitPreference): string {
  if (!distanceKm) return "-";
  return formatPace(durationMin / distanceKm, unit);
}

export function formatElevation(m: number, unit: UnitPreference): string {
  if (unit === "mi") return `${Math.round(metersToFeet(m))}ft`;
  return `${Math.round(m)}m`;
}

// Unit-agnostic (minutes are minutes) but was duplicated ~3 times with
// slightly different styles across the app — centralized here.
export function formatDuration(totalMinutes: number): string {
  const totalSeconds = Math.round(totalMinutes * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
