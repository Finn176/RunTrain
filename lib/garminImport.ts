// Parses a Garmin Connect activity-list CSV export into normalized run
// records. This is the CSV from the Activities page's "Export CSV" button
// (not Garmin's full account data export, which is a completely different,
// much more raw format).
//
// Garmin's own community/forums confirm this format is messier than
// Strava's: the exact column set varies by activity type and by what data
// happens to be present, and — critically — there's no stable per-activity
// ID column to dedupe on. So this parser:
//  - Looks up columns by name (never by position), so extra/missing columns
//    for other activity types don't break anything.
//  - Matches any Activity Type containing "run" (covers Running, Trail
//    Running, Treadmill Running, etc.)
//  - Takes "Distance" at face value in whatever unit the caller specifies —
//    Garmin exports distance in the unit your account is set to display
//    (km or miles), and that can't be reliably auto-detected the way
//    Strava's meters-vs-km can, so the caller (the import UI) must say
//    which one it is.
//  - Parses "Moving Time" (preferred) or "Time" as H:MM:SS duration strings,
//    NOT raw seconds like Strava.
//  - Synthesizes a dedupe key from date+distance+duration, since there's no
//    activity ID column to use instead. Re-uploading the same export won't
//    create duplicates as long as the date/distance/duration match exactly.

import { parseCsv } from "./csv";
import { isPlausibleDistanceKm, isPlausibleDurationMin, KM_PER_MILE, round } from "./importShared";

export type GarminDistanceUnit = "km" | "mi";

export interface ParsedGarminRun {
  externalId: string;
  date: Date;
  distanceKm: number;
  durationMin: number;
  name: string;
  elevationGainM: number | null;
  calories: number | null;
}

export interface GarminImportResult {
  runs: ParsedGarminRun[];
  totalRows: number;
  nonRunRows: number;
  invalidRows: number;
}

function parseGarminDate(raw: string): Date | null {
  if (!raw) return null;
  // Garmin's activity list export uses "YYYY-MM-DD HH:mm:ss" (24-hour,
  // unambiguous) — verified against a real export. Handle it directly
  // rather than relying on the JS Date constructor's locale-dependent
  // parsing of space-separated date/time strings.
  const isoLike = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (isoLike) {
    const [, y, mo, d, h, mi, s] = isoLike;
    const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
    if (!isNaN(date.getTime())) return date;
  }

  // Fallback for any other format Garmin might use.
  const direct = new Date(raw);
  if (!isNaN(direct.getTime())) return direct;

  return null;
}

function parseDurationString(raw: string): number | null {
  if (!raw) return null;
  // H:MM:SS or H:MM:SS.s
  const long = raw.match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  if (long) {
    const hours = parseInt(long[1], 10);
    const minutes = parseInt(long[2], 10);
    const seconds = parseFloat(long[3]);
    return hours * 60 + minutes + seconds / 60;
  }
  // MM:SS or MM:SS.s (seen in some Garmin exports for shorter durations)
  const short = raw.match(/^(\d+):(\d{2}(?:\.\d+)?)$/);
  if (short) {
    const minutes = parseInt(short[1], 10);
    const seconds = parseFloat(short[2]);
    return minutes + seconds / 60;
  }
  return null;
}

function parseGarminDistance(raw: string, unit: GarminDistanceUnit): number | null {
  const cleaned = (raw ?? "").replace(/,/g, ""); // strip any thousands separators defensively
  const value = parseFloat(cleaned);
  if (isNaN(value) || value <= 0) return null;
  const km = unit === "mi" ? value * KM_PER_MILE : value;
  if (!isPlausibleDistanceKm(km)) return null;
  return km;
}

// Best-effort optional numeric field parsing — these enhance the activity
// detail view but aren't required, so any parsing failure just means the
// field shows as unavailable rather than blocking the import. Garmin's
// "Calories" column uses thousands separators (e.g. "1,202"), confirmed
// against a real export, hence the comma strip.
function parseOptionalNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = parseFloat(raw.replace(/,/g, ""));
  return isNaN(value) ? null : value;
}

export function parseGarminActivitiesCsv(csvText: string, distanceUnit: GarminDistanceUnit): GarminImportResult {
  const rows = parseCsv(csvText);
  const runs: ParsedGarminRun[] = [];
  let nonRunRows = 0;
  let invalidRows = 0;

  for (const row of rows) {
    const activityType = row["Activity Type"] ?? "";
    if (!/run/i.test(activityType)) {
      nonRunRows++;
      continue;
    }

    const date = parseGarminDate(row["Date"] ?? "");
    const distanceKm = parseGarminDistance(row["Distance"] ?? "", distanceUnit);
    const durationRaw = row["Moving Time"] || row["Time"] || "";
    const durationMinRaw = parseDurationString(durationRaw);
    const durationMin = durationMinRaw != null && isPlausibleDurationMin(durationMinRaw) ? durationMinRaw : null;

    if (!date || distanceKm == null || durationMin == null) {
      invalidRows++;
      continue;
    }

    const name = row["Title"] || "Garmin run";
    // No stable activity ID in this export — synthesize a dedupe key from
    // fields that together are effectively unique per real activity.
    const externalId = `garmin_${date.toISOString()}_${round(distanceKm, 2)}_${round(durationMin, 1)}`;

    runs.push({
      externalId,
      date,
      distanceKm: round(distanceKm, 2),
      durationMin: round(durationMin, 1),
      name,
      elevationGainM: parseOptionalNumber(row["Total Ascent"]),
      calories: parseOptionalNumber(row["Calories"]),
    });
  }

  return { runs, totalRows: rows.length, nonRunRows, invalidRows };
}
