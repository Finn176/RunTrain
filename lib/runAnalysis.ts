// Analyzes a user's logged/imported run history to tailor new training
// plans: recent weekly volume & frequency (to suggest realistic starting
// mileage and days/week) and a rough race-pace projection from their best
// recent effort (to attach real pace targets to generated workouts).
//
// This is intentionally a simple, transparent heuristic model — not a
// sports-science-grade fitness model. It's meant to give sensible, safe
// defaults, not a definitive prescription.

import type { ExperienceLevel } from "./planGenerator";

export interface RunSample {
  date: Date;
  distanceKm: number;
  durationMin: number;
}

export interface BestEffort {
  date: Date;
  distanceKm: number;
  durationMin: number;
}

export interface RunHistoryAnalysis {
  hasData: boolean;
  weeksWithActivity: number;
  avgWeeklyKm: number;
  maxWeeklyKm: number;
  avgRunsPerWeek: number;
  suggestedDaysPerWeek: number;
  suggestedExperienceLevel: ExperienceLevel;
  suggestedStartingWeeklyKm: number;
  bestEffort: BestEffort | null;
  estimatedRacePaceMinPerKm: number | null;
  // Weighted average pace (total logged minutes / total logged km) across the
  // same recent window used for volume analysis. This reflects what the
  // athlete actually runs day-to-day — used to anchor the "easy" pace zone
  // directly from real behavior, rather than purely as a percentage offset
  // from projected race pace. Some athletes (especially those who don't
  // train with a big polarized easy/hard split) run their easy days much
  // closer to race pace than a generic textbook percentage assumes; using
  // observed pace when it's available avoids prescribing an easy pace that's
  // unrealistically slower than how the athlete actually trains.
  observedPaceMinPerKm: number | null;
}

const ANALYSIS_WINDOW_DAYS = 56; // 8 weeks
const BEST_EFFORT_WINDOW_DAYS = 90;
const MIN_BEST_EFFORT_KM = 3; // ignore very short runs when looking for a "best effort"
// Riegel's formula (T2 = T1 * (D2/D1)^exponent) gets unreliable over large
// extrapolation ratios (e.g. predicting a marathon from a 1km time trial).
// Cap how far we'll extrapolate; beyond this we simply don't estimate a pace.
const MAX_RIEGEL_EXTRAPOLATION_RATIO = 10;
// The standard 1.06 exponent works reasonably well extrapolating between
// short-to-moderate distances (5K -> 10K, 10K -> half). It's well known to
// be too optimistic specifically when projecting a full marathon from
// something much shorter, though — the marathon has real physiological
// demands (glycogen depletion, "the wall" around mile 18-20) that a 10K or
// shorter effort simply doesn't test, so a plain Riegel projection tends to
// predict a faster marathon than most recreational/intermediate runners can
// actually hold. A higher exponent for marathon-distance projections
// specifically corrects for this — confirmed against a real case where the
// standard exponent predicted a marathon finish about 30-35 minutes faster
// than felt realistic.
const RIEGEL_EXPONENT = 1.06;
const MARATHON_RIEGEL_EXPONENT = 1.15;
const MARATHON_PROJECTION_THRESHOLD_KM = 30; // half marathon (21.1km) and shorter still use the standard exponent

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function mondayOnOrBefore(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function experienceLevelForVolume(avgWeeklyKm: number): ExperienceLevel {
  if (avgWeeklyKm < 20) return "beginner";
  if (avgWeeklyKm < 50) return "intermediate";
  return "advanced";
}

export function findBestEffort(runs: RunSample[], asOf: Date): BestEffort | null {
  const windowStart = new Date(asOf.getTime() - BEST_EFFORT_WINDOW_DAYS * 24 * 3600 * 1000);
  let best: BestEffort | null = null;
  let bestPace = Infinity;

  for (const run of runs) {
    if (run.date < windowStart || run.date > asOf) continue;
    if (run.distanceKm < MIN_BEST_EFFORT_KM || run.durationMin <= 0) continue;
    const pace = run.durationMin / run.distanceKm;
    if (pace < bestPace) {
      bestPace = pace;
      best = { date: run.date, distanceKm: run.distanceKm, durationMin: run.durationMin };
    }
  }

  return best;
}

export function estimateRacePaceMinPerKm(bestEffort: BestEffort | null, targetDistanceKm: number): number | null {
  if (!bestEffort || targetDistanceKm <= 0) return null;
  const ratio = targetDistanceKm / bestEffort.distanceKm;
  if (ratio > MAX_RIEGEL_EXTRAPOLATION_RATIO || ratio <= 0) return null;

  const exponent = targetDistanceKm > MARATHON_PROJECTION_THRESHOLD_KM ? MARATHON_RIEGEL_EXPONENT : RIEGEL_EXPONENT;
  const projectedTotalMin = bestEffort.durationMin * Math.pow(ratio, exponent);
  return projectedTotalMin / targetDistanceKm;
}

// Weighted average pace (total minutes / total km, not a simple average of
// per-run paces, so longer runs count proportionally more) across the same
// recent window used elsewhere for volume analysis. This is a direct
// reflection of how the athlete actually trains day-to-day.
export function estimateObservedPaceMinPerKm(runs: RunSample[], asOf: Date): number | null {
  const windowStart = new Date(asOf.getTime() - ANALYSIS_WINDOW_DAYS * 24 * 3600 * 1000);
  let totalKm = 0;
  let totalMin = 0;
  for (const run of runs) {
    if (run.date < windowStart || run.date > asOf) continue;
    if (run.distanceKm <= 0 || run.durationMin <= 0) continue;
    totalKm += run.distanceKm;
    totalMin += run.durationMin;
  }
  return totalKm > 0 ? totalMin / totalKm : null;
}

export function analyzeRunHistory(
  runs: RunSample[],
  targetDistanceKm: number,
  asOf: Date = new Date()
): RunHistoryAnalysis {
  const windowStart = new Date(asOf.getTime() - ANALYSIS_WINDOW_DAYS * 24 * 3600 * 1000);
  const currentWeekMonday = mondayOnOrBefore(asOf);
  const numWeeks = 8;

  const weeklyKm = new Array(numWeeks).fill(0);
  const weeklyRunCount = new Array(numWeeks).fill(0);

  for (const run of runs) {
    if (run.date < windowStart || run.date > asOf) continue;
    const weekMonday = mondayOnOrBefore(run.date);
    const weeksAgo = Math.round((currentWeekMonday.getTime() - weekMonday.getTime()) / (7 * 24 * 3600 * 1000));
    const idx = numWeeks - 1 - weeksAgo;
    if (idx < 0 || idx >= numWeeks) continue;
    weeklyKm[idx] += run.distanceKm;
    weeklyRunCount[idx] += 1;
  }

  const weeksWithActivity = weeklyKm.filter((km) => km > 0).length;
  const avgWeeklyKm = weeklyKm.reduce((s, km) => s + km, 0) / numWeeks;
  const maxWeeklyKm = Math.max(...weeklyKm);
  const totalRuns = weeklyRunCount.reduce((s, c) => s + c, 0);
  const avgRunsPerWeek = totalRuns / numWeeks;

  const bestEffort = findBestEffort(runs, asOf);
  const estimatedPace = estimateRacePaceMinPerKm(bestEffort, targetDistanceKm);
  const observedPace = estimateObservedPaceMinPerKm(runs, asOf);

  return {
    hasData: weeksWithActivity > 0,
    weeksWithActivity,
    avgWeeklyKm: round1(avgWeeklyKm),
    maxWeeklyKm: round1(maxWeeklyKm),
    avgRunsPerWeek: round1(avgRunsPerWeek),
    suggestedDaysPerWeek: Math.min(6, Math.max(3, Math.round(avgRunsPerWeek))),
    suggestedExperienceLevel: experienceLevelForVolume(avgWeeklyKm),
    suggestedStartingWeeklyKm: Math.round(avgWeeklyKm),
    bestEffort,
    estimatedRacePaceMinPerKm: estimatedPace,
    observedPaceMinPerKm: observedPace,
  };
}
