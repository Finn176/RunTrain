// Core training-plan generation algorithm.
// Produces a periodized (Base -> Build -> Peak -> Taper -> Race) week-by-week
// running plan, similar in spirit to Runna's adaptive plans, based on:
//   - target race distance & date
//   - how many days/week the athlete can run
//   - experience level
//   - current weekly mileage
//
// All internal math (weekly targets, long-run sizing, etc.) is always done
// in km — a user's km/miles display preference (lib/units.ts) only affects
// how numbers are formatted into the workout description text below. The
// one deliberate exception: interval rep distances (400m/800m/1km) are left
// as-is regardless of unit, the same way "5K"/"10K" race labels never
// become "3.1mi"/"6.2mi" elsewhere in the app — they're standard track
// segment names, not a raw distance being converted.

import { formatDistance, formatPace, formatPaceRange, type UnitPreference } from "./units";

export type RaceDistance = "5k" | "10k" | "half" | "marathon";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type WorkoutType =
  | "Easy"
  | "Long"
  | "Tempo"
  | "Intervals"
  | "Rest"
  | "CrossTrain"
  | "Race";
export type Phase = "Base" | "Build" | "Peak" | "Taper" | "Race";

export interface PlanInput {
  raceDistance: RaceDistance;
  raceDate: Date;
  startDate: Date;
  daysPerWeek: number; // 3-6
  experienceLevel: ExperienceLevel;
  startingWeeklyKm: number;
  // Optional: a projected race pace (min/km) for the goal race distance,
  // derived from the athlete's real training history (see lib/runAnalysis.ts).
  // When provided, workout descriptions include real pace guidance instead
  // of generic "easy pace" / "comfortably hard" language.
  estimatedRacePaceMinPerKm?: number;
  // Optional: the athlete's real weighted-average training pace (min/km)
  // over their recent logged history (see estimateObservedPaceMinPerKm in
  // lib/runAnalysis.ts). When available, this anchors the "easy" zone
  // directly instead of deriving it as a percentage of race pace — some
  // athletes don't train with a big easy/race pace split, and a generic
  // percentage can prescribe an easy pace far slower than how they actually
  // run. Tempo/interval zones still scale off race pace regardless.
  observedPaceMinPerKm?: number;
  // Display unit for the generated description text. Defaults to km.
  unit?: UnitPreference;
}

export interface PaceGuidance {
  easy: string;
  tempo: string;
  interval: string;
  racePace: string;
}

// How far each training zone sits from goal race pace, as a multiplier on
// race pace (minutes per km/mile — since it's a ratio, the unit cancels
// out). This has to vary by race distance, and not just in magnitude but in
// *direction*:
//   - 5K goal pace is itself a near-maximal effort. Tempo (a controlled,
//     comfortably-hard effort) is slower than that; intervals sit at/near it.
//     So tempo/interval multipliers are close to 1.0, tempo slightly above.
//   - For 10K/half/marathon, goal race pace is progressively more moderate —
//     a marathoner's goal pace, especially, is a sustainable aerobic effort,
//     nowhere near their threshold. Real tempo/interval sessions for these
//     distances are run FASTER than goal race pace (tempo ~ 10K-to-half
//     effort, intervals ~ 5K-to-10K effort), not slower. Multipliers below
//     1.0 reflect that.
// Roughly consistent with commonly published training pace calculators
// (e.g. McMillan, Jack Daniels' VDOT tables) — approximate by design, not
// lab-derived, per this file's stated intent.
const PACE_ZONE_FACTORS: Record<
  RaceDistance,
  { easyLow: number; easyHigh: number; tempoLow: number; tempoHigh: number; intervalLow: number; intervalHigh: number }
> = {
  "5k": { easyLow: 1.28, easyHigh: 1.4, tempoLow: 1.06, tempoHigh: 1.12, intervalLow: 0.93, intervalHigh: 0.98 },
  "10k": { easyLow: 1.2, easyHigh: 1.32, tempoLow: 1.0, tempoHigh: 1.05, intervalLow: 0.9, intervalHigh: 0.95 },
  half: { easyLow: 1.14, easyHigh: 1.24, tempoLow: 0.95, tempoHigh: 1.0, intervalLow: 0.85, intervalHigh: 0.92 },
  marathon: { easyLow: 1.1, easyHigh: 1.2, tempoLow: 0.9, tempoHigh: 0.96, intervalLow: 0.82, intervalHigh: 0.88 },
};

// How wide a range to show around the athlete's own observed average pace
// when using it to anchor the "easy" zone (rather than a percentage of race
// pace). A fairly tight band, since this is real data, not a rough estimate.
const OBSERVED_PACE_LOW_FACTOR = 0.95;
const OBSERVED_PACE_HIGH_FACTOR = 1.05;

// Safety margin enforced regardless of what the race-pace-derived numbers
// say: each harder zone's slowest pace must be at least this much faster
// than the zone below it's fastest pace. This is what prevents tempo/interval
// from ever coming out slower than (or indistinguishable from) easy — which
// can otherwise happen for an athlete whose real observed easy pace sits
// close to their projected race pace (not everyone trains with a big
// easy/hard split).
const MIN_ZONE_GAP_FACTOR = 0.97;

function clampFaster(
  low: number,
  high: number,
  ceiling: number
): { low: number; high: number } {
  if (high <= ceiling) return { low, high };
  const shift = high - ceiling;
  return { low: low - shift, high: high - shift };
}

// Exported so the adaptive engine (lib/adaptivePlan.ts) can rebuild pace
// guidance from a freshly-recomputed best effort using the exact same
// zone math the initial plan generation uses, instead of duplicating it.
export function buildPaceGuidance(
  racePaceMinPerKm: number | undefined,
  raceDistance: RaceDistance,
  unit: UnitPreference = "km",
  observedPaceMinPerKm?: number
): PaceGuidance | null {
  if (!racePaceMinPerKm || racePaceMinPerKm <= 0) return null;
  const f = PACE_ZONE_FACTORS[raceDistance];

  // Prefer the athlete's real observed training pace for the easy zone when
  // we have it — it reflects how they actually run, which a generic
  // percentage-of-race-pace estimate can't. Fall back to the percentage
  // estimate only when there isn't enough logged history to compute one.
  const useObserved = !!observedPaceMinPerKm && observedPaceMinPerKm > 0;
  const easyLow = useObserved ? observedPaceMinPerKm! * OBSERVED_PACE_LOW_FACTOR : racePaceMinPerKm * f.easyLow;
  const easyHigh = useObserved ? observedPaceMinPerKm! * OBSERVED_PACE_HIGH_FACTOR : racePaceMinPerKm * f.easyHigh;

  let tempo = { low: racePaceMinPerKm * f.tempoLow, high: racePaceMinPerKm * f.tempoHigh };
  tempo = clampFaster(tempo.low, tempo.high, easyLow * MIN_ZONE_GAP_FACTOR);

  let interval = { low: racePaceMinPerKm * f.intervalLow, high: racePaceMinPerKm * f.intervalHigh };
  interval = clampFaster(interval.low, interval.high, tempo.low * MIN_ZONE_GAP_FACTOR);

  return {
    easy: formatPaceRange(easyLow, easyHigh, unit),
    tempo: formatPaceRange(tempo.low, tempo.high, unit),
    interval: formatPaceRange(interval.low, interval.high, unit),
    racePace: formatPace(racePaceMinPerKm, unit),
  };
}

export interface GeneratedWorkout {
  date: Date;
  type: WorkoutType;
  title: string;
  description: string;
  targetKm: number;
}

export interface GeneratedWeek {
  weekNumber: number;
  phase: Phase;
  startDate: Date;
  targetKm: number;
  workouts: GeneratedWorkout[];
}

export const RACE_KM: Record<RaceDistance, number> = {
  "5k": 5,
  "10k": 10,
  half: 21.1,
  marathon: 42.2,
};

export const RACE_LABEL: Record<RaceDistance, string> = {
  "5k": "5K",
  "10k": "10K",
  half: "Half Marathon",
  marathon: "Marathon",
};

const PEAK_VOLUME: Record<RaceDistance, Record<ExperienceLevel, number>> = {
  "5k": { beginner: 25, intermediate: 35, advanced: 45 },
  "10k": { beginner: 30, intermediate: 45, advanced: 60 },
  half: { beginner: 40, intermediate: 55, advanced: 75 },
  marathon: { beginner: 55, intermediate: 75, advanced: 100 },
};

const LONG_RUN_CAP: Record<RaceDistance, number> = {
  "5k": 12,
  "10k": 16,
  half: 19,
  marathon: 32,
};

const TAPER_WEEKS: Record<RaceDistance, number> = {
  "5k": 1,
  "10k": 1,
  half: 2,
  marathon: 3,
};

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function mondayOnOrBefore(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  return addDays(d, -diff);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Day-of-week templates (0=Mon..6=Sun). "quality" = one key speed/tempo
// session for the week, "easy" = easy aerobic runs, "long" = the long run.
interface DayTemplate {
  quality: number;
  easy: number[];
  long: number;
}

const TEMPLATES: Record<number, DayTemplate> = {
  3: { quality: 1, easy: [3], long: 6 },
  4: { quality: 1, easy: [3, 5], long: 6 },
  5: { quality: 1, easy: [2, 3, 5], long: 6 },
  6: { quality: 1, easy: [0, 2, 3, 5], long: 6 },
};

function pickTemplate(daysPerWeek: number): DayTemplate {
  const clamped = Math.min(6, Math.max(3, Math.round(daysPerWeek)));
  return TEMPLATES[clamped];
}

function qualityWorkout(
  phase: Phase,
  weekIndexInPhase: number,
  raceDistance: RaceDistance,
  qualityKm: number,
  pace: PaceGuidance | null,
  unit: UnitPreference
): { type: WorkoutType; title: string; description: string } {
  const wuKm = round1(Math.min(2, qualityKm * 0.25));
  const cdKm = round1(Math.min(2, qualityKm * 0.25));
  const coreKm = round1(Math.max(1, qualityKm - wuKm - cdKm));
  const wu = formatDistance(wuKm, unit);
  const cd = formatDistance(cdKm, unit);
  const core = formatDistance(coreKm, unit);

  if (phase === "Base") {
    return {
      type: "Easy",
      title: "Easy Run + Strides",
      description: `${formatDistance(qualityKm, unit)} easy pace${pace ? ` (${pace.easy})` : ""}, finishing with 6 x 20sec relaxed strides with full recovery. Builds leg speed without adding hard stress.`,
    };
  }

  const useIntervals = weekIndexInPhase % 2 === 0;

  if (phase === "Taper") {
    return {
      type: "Intervals",
      title: "Short Sharp Openers",
      description: `${wu} easy warm-up, 4-6 x 30sec strides at race-effort${pace ? ` (~${pace.racePace})` : ""} with full recovery, ${cd} easy cool-down. Keep the legs sharp without adding fatigue.`,
    };
  }

  if (phase === "Peak") {
    if (raceDistance === "5k" || raceDistance === "10k") {
      return {
        type: "Intervals",
        title: "Race-Pace Intervals",
        description: `${wu} warm-up, 5-6 x 1km @ goal race pace${pace ? ` (${pace.racePace})` : ""} with 90sec jog recovery, ${cd} cool-down.`,
      };
    }
    return {
      type: "Tempo",
      title: "Race-Pace Tempo",
      description: `${wu} warm-up, ${core} @ goal race pace${pace ? ` (${pace.racePace})` : ""} (comfortably hard, controlled), ${cd} cool-down.`,
    };
  }

  // Build phase
  if (useIntervals) {
    // Interval rep distances are standard track segments (like race labels
    // "5K"/"10K") and intentionally aren't converted to miles.
    const repDistance =
      raceDistance === "5k" ? "400m" : raceDistance === "10k" ? "800m" : "1km";
    const reps = Math.max(4, Math.round((coreKm * 1000) / (repDistance === "400m" ? 400 : repDistance === "800m" ? 800 : 1000)));
    return {
      type: "Intervals",
      title: "Interval Session",
      description: `${wu} warm-up, ${reps} x ${repDistance} at 5K effort${pace ? ` (${pace.interval})` : ""} with equal-time jog recovery, ${cd} cool-down.`,
    };
  }
  return {
    type: "Tempo",
    title: "Tempo Run",
    description: `${wu} warm-up, ${core} @ tempo pace${pace ? ` (${pace.tempo})` : ""} (comfortably hard), ${cd} cool-down.`,
  };
}

export function generatePlan(input: PlanInput): GeneratedWeek[] {
  const { raceDistance, raceDate, daysPerWeek, experienceLevel, startingWeeklyKm } = input;
  const unit: UnitPreference = input.unit ?? "km";
  const paceGuidance = buildPaceGuidance(input.estimatedRacePaceMinPerKm, raceDistance, unit, input.observedPaceMinPerKm);

  const startMonday = mondayOnOrBefore(input.startDate);
  const msPerWeek = 7 * 24 * 3600 * 1000;
  let totalWeeks = Math.round((raceDate.getTime() - startMonday.getTime()) / msPerWeek);
  totalWeeks = Math.max(4, Math.min(32, totalWeeks));

  const taperWeeks = Math.min(TAPER_WEEKS[raceDistance], Math.max(1, totalWeeks - 3));
  const remainingWeeks = totalWeeks - taperWeeks;
  const peakWeeks = remainingWeeks >= 8 ? 2 : remainingWeeks >= 5 ? 1 : 0;
  const rampWeeks = Math.max(1, remainingWeeks - peakWeeks);
  const baseWeeks = Math.max(1, Math.round(rampWeeks * 0.55));
  const buildWeeks = Math.max(0, rampWeeks - baseWeeks);

  const peakVolumeTable = PEAK_VOLUME[raceDistance][experienceLevel];
  const targetPeak = Math.max(peakVolumeTable, round1(startingWeeklyKm * 1.05));

  const weeklyTargets: number[] = [];

  for (let i = 0; i < rampWeeks; i++) {
    const progress = rampWeeks === 1 ? 1 : i / (rampWeeks - 1);
    let km = startingWeeklyKm + (targetPeak - startingWeeklyKm) * progress;
    const weekNum = i + 1;
    if (weekNum % 4 === 0 && weekNum !== rampWeeks) {
      km *= 0.78; // cutback / recovery week every 4th week
    }
    weeklyTargets.push(Math.max(startingWeeklyKm * 0.6, round1(km)));
  }

  for (let i = 0; i < peakWeeks; i++) {
    const factor = i === peakWeeks - 1 ? 0.95 : 1;
    weeklyTargets.push(round1(targetPeak * factor));
  }

  for (let i = 0; i < taperWeeks; i++) {
    const remaining = taperWeeks - i;
    const factor = remaining >= 3 ? 0.75 : remaining === 2 ? 0.6 : 0.4;
    weeklyTargets.push(round1(targetPeak * factor));
  }

  function phaseForWeek(i: number): Phase {
    if (i < baseWeeks) return "Base";
    if (i < baseWeeks + buildWeeks) return "Build";
    if (i < baseWeeks + buildWeeks + peakWeeks) return "Peak";
    if (i < totalWeeks - 1) return "Taper";
    return "Race";
  }

  const template = pickTemplate(daysPerWeek);
  const weeks: GeneratedWeek[] = [];

  // Track week-index-within-phase for alternating tempo/intervals
  const phaseCounters: Record<Phase, number> = { Base: 0, Build: 0, Peak: 0, Taper: 0, Race: 0 };

  for (let i = 0; i < totalWeeks; i++) {
    const phase = phaseForWeek(i);
    const weekStart = addDays(startMonday, i * 7);
    const weeklyTarget = weeklyTargets[i];
    const isRaceWeek = phase === "Race";

    const longKm = isRaceWeek
      ? RACE_KM[raceDistance]
      : Math.min(LONG_RUN_CAP[raceDistance], round1(weeklyTarget * 0.32));
    const qualityKm = round1(weeklyTarget * 0.18);
    const usedKm = longKm + (isRaceWeek ? 0 : qualityKm);
    const easyTotal = Math.max(0, weeklyTarget - usedKm);
    const easyEach = template.easy.length > 0 ? round1(easyTotal / template.easy.length) : 0;

    const workouts: GeneratedWorkout[] = [];

    for (let d = 0; d < 7; d++) {
      const date = addDays(weekStart, d);

      if (d === template.long) {
        if (isRaceWeek) {
          workouts.push({
            date: raceDate,
            type: "Race",
            title: `Race Day: ${RACE_LABEL[raceDistance]}`,
            description:
              "This is it! Warm up gently, trust the training you've banked, and execute your race plan. Good luck!",
            targetKm: RACE_KM[raceDistance],
          });
        } else {
          workouts.push({
            date,
            type: "Long",
            title: "Long Run",
            description: `${formatDistance(longKm, unit)} at an easy, conversational pace${
              paceGuidance ? ` (${paceGuidance.easy})` : ""
            }. This is the key endurance-building session of the week — don't run it too fast.`,
            targetKm: longKm,
          });
        }
        continue;
      }

      if (d === template.quality && !isRaceWeek) {
        const q = qualityWorkout(phase, phaseCounters[phase], raceDistance, qualityKm, paceGuidance, unit);
        workouts.push({ date, type: q.type, title: q.title, description: q.description, targetKm: qualityKm });
        continue;
      }

      if (template.easy.includes(d) && !isRaceWeek) {
        workouts.push({
          date,
          type: "Easy",
          title: "Easy Run",
          description: `${formatDistance(easyEach, unit)} at an easy, conversational pace${
            paceGuidance ? ` (${paceGuidance.easy})` : ""
          }. Focus on time on feet and recovery, not speed.`,
          targetKm: easyEach,
        });
        continue;
      }

      // Rest / cross-train day
      if (isRaceWeek) {
        workouts.push({
          date,
          type: "Rest",
          title: "Rest",
          description: "Rest and recover. Hydrate, stretch, and stay off your feet.",
          targetKm: 0,
        });
      } else {
        workouts.push({
          date,
          type: "Rest",
          title: "Rest Day",
          description:
            "Full rest, or light optional cross-training (cycling, swimming, yoga) if you feel like moving.",
          targetKm: 0,
        });
      }
    }

    phaseCounters[phase]++;

    weeks.push({
      weekNumber: i + 1,
      phase,
      startDate: weekStart,
      targetKm: weeklyTarget,
      workouts,
    });
  }

  return weeks;
}
