// Parses a Strava "bulk export" activities.csv into normalized run records.
//
// Strava's export format isn't fully/consistently documented, so this is
// deliberately defensive:
//  - Matches any Activity Type containing "run" (covers Run, Trail Run,
//    Virtual Run, etc.) rather than an exact "Run" match.
//  - Distance unit (meters vs already-km) isn't consistently documented, so
//    we detect it per-row: real running distances are always well under
//    300 when expressed in km (a 300km single run doesn't happen) and
//    always well over 300 when expressed in meters (a 300m "run" wouldn't
//    typically be logged as its own activity). So: > 300 => meters, else km.
//  - Duration prefers "Moving Time" (excludes stops, e.g. traffic lights)
//    over "Elapsed Time", falling back to Elapsed Time if Moving Time is
//    missing or zero.
//  - Rows that don't parse cleanly are skipped rather than guessed at.

import { parseCsv } from "./csv";
import { isPlausibleDistanceKm, isPlausibleDurationMin, round } from "./importShared";

export interface ParsedStravaRun {
  externalId: string;
  date: Date;
  distanceKm: number;
  durationMin: number;
  name: string;
  elevationGainM: number | null;
  calories: number | null;
}

export interface StravaImportResult {
  runs: ParsedStravaRun[];
  totalRows: number;
  nonRunRows: number;
  invalidRows: number;
}

const DISTANCE_METERS_THRESHOLD = 300;

function parseStravaDate(raw: string): Date | null {
  if (!raw) return null;
  const direct = new Date(raw);
  if (!isNaN(direct.getTime())) return direct;

  // Fallback for "YYYY-MM-DD HH:mm:ss" style timestamps.
  const alt = new Date(raw.replace(" ", "T"));
  if (!isNaN(alt.getTime())) return alt;

  return null;
}

function parseDistanceKm(raw: string): number | null {
  const value = parseFloat(raw);
  if (isNaN(value) || value <= 0) return null;
  const km = value > DISTANCE_METERS_THRESHOLD ? value / 1000 : value;
  if (!isPlausibleDistanceKm(km)) return null;
  return km;
}

function parseDurationMin(movingTimeRaw: string, elapsedTimeRaw: string): number | null {
  const movingSeconds = parseFloat(movingTimeRaw);
  const elapsedSeconds = parseFloat(elapsedTimeRaw);
  const seconds = movingSeconds > 0 ? movingSeconds : elapsedSeconds > 0 ? elapsedSeconds : NaN;
  if (isNaN(seconds) || seconds <= 0) return null;
  const minutes = seconds / 60;
  if (!isPlausibleDurationMin(minutes)) return null;
  return minutes;
}

// Best-effort optional numeric field parsing — these enhance the activity
// detail view but aren't required, so any parsing failure just means the
// field shows as unavailable rather than blocking the import. Strava's
// column names for these aren't independently verified against a real
// export the way the core fields are, so this is deliberately tolerant.
function parseOptionalNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = parseFloat(raw.replace(/,/g, ""));
  return isNaN(value) ? null : value;
}

export function parseStravaActivitiesCsv(csvText: string): StravaImportResult {
  const rows = parseCsv(csvText);
  const runs: ParsedStravaRun[] = [];
  let nonRunRows = 0;
  let invalidRows = 0;

  for (const row of rows) {
    const activityType = row["Activity Type"] ?? "";
    if (!/run/i.test(activityType)) {
      nonRunRows++;
      continue;
    }

    const externalId = (row["Activity ID"] ?? "").trim();
    const date = parseStravaDate(row["Activity Date"] ?? "");
    const distanceKm = parseDistanceKm(row["Distance"] ?? "");
    const durationMin = parseDurationMin(row["Moving Time"] ?? "", row["Elapsed Time"] ?? "");

    if (!externalId || !date || distanceKm == null || durationMin == null) {
      invalidRows++;
      continue;
    }

    runs.push({
      externalId,
      date,
      distanceKm: round(distanceKm, 2),
      durationMin: round(durationMin, 1),
      name: row["Activity Name"] || "Strava run",
      elevationGainM: parseOptionalNumber(row["Elevation Gain"]),
      calories: parseOptionalNumber(row["Calories"]),
    });
  }

  return { runs, totalRows: rows.length, nonRunRows, invalidRows };
}
