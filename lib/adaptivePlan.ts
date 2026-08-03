// Adaptive plan engine: takes a generated plan (as originally stored) plus
// the athlete's real logged run history, and produces an adjusted view of
// the *not-yet-happened* portion of the plan.
//
// This is a transparent, rules-based recalculation model, not a machine
// learning model — but the rules themselves come from established
// sports-science concepts rather than being made up:
//
//  - Acute:Chronic Workload Ratio (ACWR): compares the last 7 days of
//    training volume to the trailing 4-week average. A ratio in ~0.8-1.3 is
//    the commonly-cited "sweet spot"; above ~1.5 is a widely used elevated
//    injury-risk threshold (Gabbett et al.). When it's high, next week's
//    volume is hard-capped rather than left to climb further.
//  - Missed-session backoff: if you've completed under half of what was
//    scheduled over the last couple of weeks, the plan doesn't just plough
//    on at the original number — it re-ramps from a lower base for a week
//    or two, the way a coach would after a layoff, rather than assuming you
//    can absorb the original jump in load.
//  - Readiness bump: if you've been comfortably completing everything at a
//    low reported effort, volume nudges up slightly — capped at the plan's
//    own original peak, so it never invents a bigger ask than the plan's
//    race-distance/experience table would have set in the first place.
//  - Pace refresh: race-pace projections (Riegel's formula, see
//    lib/runAnalysis.ts) are recomputed from your most recent best effort
//    rather than frozen at plan-creation time, so upcoming workouts' pace
//    guidance reflects real, current fitness.
//
// Only workouts that haven't happened yet are ever touched. Anything in the
// past — completed or missed — keeps its original description and target
// exactly as it was, so your history is never silently rewritten.

import type { PaceGuidance, RaceDistance } from "./planGenerator";
import { RACE_KM, RACE_LABEL, buildPaceGuidance } from "./planGenerator";
import type { RunSample } from "./runAnalysis";
import { findBestEffort, estimateRacePaceMinPerKm, estimateObservedPaceMinPerKm } from "./runAnalysis";
import type { UnitPreference } from "./units";
import { formatDistance } from "./units";

export interface AdaptiveRunLike {
  id: string;
  distanceKm: number;
  durationMin: number;
  perceivedEffort: number | null;
  notes: string | null;
}

export interface AdaptiveWorkoutInput {
  id: string;
  date: Date;
  type: string;
  title: string;
  description: string;
  targetKm: number;
  completed: boolean;
  run: AdaptiveRunLike | null;
  // True once a user has hand-edited this workout via the plan screen. See
  // the schema comment on PlanWorkout.manuallyEdited — this workout is then
  // treated like a past one below: frozen, never recomputed.
  manuallyEdited: boolean;
}

export interface AdaptiveWeekInput {
  id: string;
  weekNumber: number;
  phase: string;
  startDate: Date;
  targetKm: number;
  workouts: AdaptiveWorkoutInput[];
}

export interface AdaptivePlanInput {
  raceDistance: string;
  raceDate: Date;
  estimatedRacePaceMinPerKm: number | null;
  weeks: AdaptiveWeekInput[];
}

export interface AdaptiveWorkout extends AdaptiveWorkoutInput {
  originalTargetKm: number;
  originalDescription: string;
  adjusted: boolean;
}

export interface AdaptiveWeek {
  id: string;
  weekNumber: number;
  phase: string;
  startDate: Date;
  targetKm: number;
  originalTargetKm: number;
  isPast: boolean;
  isCurrent: boolean;
  completionRate: number | null;
  workouts: AdaptiveWorkout[];
}

export type AcwrStatus = "unknown" | "low" | "ok" | "elevated" | "high";

export interface AdaptivePlanSummary {
  acwr: {
    ratio: number | null;
    status: AcwrStatus;
    acuteKm: number;
    chronicWeeklyKm: number;
  };
  recentCompletionRate: number | null;
  recentAvgEffort: number | null;
  volumeAdjustmentPercent: number;
  affectedWeekCount: number;
  estimatedRacePaceMinPerKm: number | null;
  paceUpdated: boolean;
  raceLabel: string;
  raceDistanceKm: number;
  projectedFinishMin: number | null;
  projectedFinishTime: string | null;
  notes: string[];
}

export interface AdaptivePlanResult {
  weeks: AdaptiveWeek[];
  summary: AdaptivePlanSummary;
}

const ACUTE_WINDOW_DAYS = 7;
const CHRONIC_WINDOW_DAYS = 28;
const RECENT_WEEKS_TO_CONSIDER = 2;
const PACE_CHANGE_NOTE_THRESHOLD_MIN_PER_KM = 0.033; // ~2 sec/km

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function dateOnly(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function isCountableWorkout(w: { type: string }): boolean {
  return w.type !== "Rest" && w.type !== "CrossTrain";
}

// Formats a total-minutes duration as "H:MM:SS" (races over an hour, e.g.
// half/marathon) or "MM:SS" (shorter races), matching the style already
// used for run durations elsewhere in the app.
function formatFinishTime(totalMinutes: number): string {
  const totalSeconds = Math.round(totalMinutes * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function renderDescription(
  type: string,
  title: string,
  targetKm: number,
  pace: PaceGuidance | null,
  raceDistance: RaceDistance,
  unit: UnitPreference
): string {
  const wuKm = round1(Math.min(2, targetKm * 0.25));
  const cdKm = round1(Math.min(2, targetKm * 0.25));
  const coreKm = round1(Math.max(1, targetKm - wuKm - cdKm));
  const wu = formatDistance(wuKm, unit);
  const cd = formatDistance(cdKm, unit);
  const core = formatDistance(coreKm, unit);

  if (type === "Long") {
    return `${formatDistance(targetKm, unit)} at an easy, conversational pace${
      pace ? ` (${pace.easy})` : ""
    }. This is the key endurance-building session of the week — don't run it too fast.`;
  }
  if (type === "Easy" && title === "Easy Run + Strides") {
    return `${formatDistance(targetKm, unit)} easy pace${
      pace ? ` (${pace.easy})` : ""
    }, finishing with 6 x 20sec relaxed strides with full recovery. Builds leg speed without adding hard stress.`;
  }
  if (type === "Easy") {
    return `${formatDistance(targetKm, unit)} at an easy, conversational pace${
      pace ? ` (${pace.easy})` : ""
    }. Focus on time on feet and recovery, not speed.`;
  }
  if (title === "Short Sharp Openers") {
    return `${wu} easy warm-up, 4-6 x 30sec strides at race-effort${
      pace ? ` (~${pace.racePace})` : ""
    } with full recovery, ${cd} easy cool-down. Keep the legs sharp without adding fatigue.`;
  }
  if (title === "Race-Pace Intervals") {
    return `${wu} warm-up, 5-6 x 1km @ goal race pace${
      pace ? ` (${pace.racePace})` : ""
    } with 90sec jog recovery, ${cd} cool-down.`;
  }
  if (title === "Race-Pace Tempo") {
    return `${wu} warm-up, ${core} @ goal race pace${
      pace ? ` (${pace.racePace})` : ""
    } (comfortably hard, controlled), ${cd} cool-down.`;
  }
  if (title === "Interval Session") {
    // Interval rep distances are standard track segments and intentionally
    // aren't converted to miles — same reasoning as lib/planGenerator.ts.
    const repDistance = raceDistance === "5k" ? "400m" : raceDistance === "10k" ? "800m" : "1km";
    const perRepM = repDistance === "400m" ? 400 : repDistance === "800m" ? 800 : 1000;
    const reps = Math.max(4, Math.round((coreKm * 1000) / perRepM));
    return `${wu} warm-up, ${reps} x ${repDistance} at 5K effort${
      pace ? ` (${pace.interval})` : ""
    } with equal-time jog recovery, ${cd} cool-down.`;
  }
  if (title === "Tempo Run") {
    return `${wu} warm-up, ${core} @ tempo pace${
      pace ? ` (${pace.tempo})` : ""
    } (comfortably hard), ${cd} cool-down.`;
  }
  // Shouldn't normally be reached (Rest/CrossTrain/Race are filtered out
  // before this is called) — fail safe rather than inventing new phrasing.
  return formatDistance(targetKm, unit);
}

export function computeAdaptivePlan(
  plan: AdaptivePlanInput,
  allRuns: RunSample[],
  asOf: Date = new Date(),
  unit: UnitPreference = "km"
): AdaptivePlanResult {
  const weeks = plan.weeks;
  const today = dateOnly(asOf);

  if (weeks.length === 0) {
    const rd = plan.raceDistance as RaceDistance;
    return {
      weeks: [],
      summary: {
        acwr: { ratio: null, status: "unknown", acuteKm: 0, chronicWeeklyKm: 0 },
        recentCompletionRate: null,
        recentAvgEffort: null,
        volumeAdjustmentPercent: 0,
        affectedWeekCount: 0,
        estimatedRacePaceMinPerKm: plan.estimatedRacePaceMinPerKm,
        paceUpdated: false,
        raceLabel: RACE_LABEL[rd] ?? plan.raceDistance,
        raceDistanceKm: RACE_KM[rd] ?? 0,
        projectedFinishMin: null,
        projectedFinishTime: null,
        notes: [],
      },
    };
  }

  // --- Week boundaries & classification ---------------------------------
  const bounds = weeks.map((w, idx) => {
    const start = dateOnly(w.startDate);
    const next = weeks[idx + 1] ? dateOnly(weeks[idx + 1].startDate) : Infinity;
    return { start, end: next };
  });

  const isPastWeek = bounds.map((b) => b.end <= today);
  const isCurrentWeek = bounds.map((b) => b.start <= today && today < b.end);

  // --- Recent completion rate & effort (last up to 2 fully-elapsed weeks) --
  const recentPastIdx = weeks
    .map((_, idx) => idx)
    .filter((idx) => isPastWeek[idx] && weeks[idx].phase !== "Race")
    .sort((a, b) => b - a)
    .slice(0, RECENT_WEEKS_TO_CONSIDER);

  const weekCompletionRates: number[] = [];
  const recentEfforts: number[] = [];
  for (const idx of recentPastIdx) {
    const countable = weeks[idx].workouts.filter(isCountableWorkout);
    if (countable.length > 0) {
      const completed = countable.filter((w) => w.completed).length;
      weekCompletionRates.push(completed / countable.length);
    }
    for (const w of countable) {
      if (w.completed && w.run?.perceivedEffort != null) recentEfforts.push(w.run.perceivedEffort);
    }
  }
  const recentCompletionRate =
    weekCompletionRates.length > 0
      ? weekCompletionRates.reduce((s, r) => s + r, 0) / weekCompletionRates.length
      : null;
  const recentAvgEffort =
    recentEfforts.length > 0 ? recentEfforts.reduce((s, e) => s + e, 0) / recentEfforts.length : null;

  // --- ACWR ---------------------------------------------------------------
  const acuteStart = new Date(asOf.getTime() - ACUTE_WINDOW_DAYS * 24 * 3600 * 1000);
  const chronicStart = new Date(asOf.getTime() - CHRONIC_WINDOW_DAYS * 24 * 3600 * 1000);
  const acuteKm = allRuns
    .filter((r) => r.date > acuteStart && r.date <= asOf)
    .reduce((s, r) => s + r.distanceKm, 0);
  const chronicRuns = allRuns.filter((r) => r.date > chronicStart && r.date <= asOf);
  const chronicWeeksWithData = new Set(
    chronicRuns.map((r) => Math.floor((asOf.getTime() - r.date.getTime()) / (7 * 24 * 3600 * 1000)))
  ).size;
  const chronicKmTotal = chronicRuns.reduce((s, r) => s + r.distanceKm, 0);
  const chronicWeeklyKm = chronicKmTotal / 4;

  let acwrRatio: number | null = null;
  let acwrStatus: AcwrStatus = "unknown";
  if (chronicWeeksWithData >= 2 && chronicWeeklyKm > 0) {
    acwrRatio = Math.round((acuteKm / chronicWeeklyKm) * 100) / 100;
    if (acwrRatio < 0.8) acwrStatus = "low";
    else if (acwrRatio <= 1.3) acwrStatus = "ok";
    else if (acwrRatio <= 1.5) acwrStatus = "elevated";
    else acwrStatus = "high";
  }

  // --- Volume adjustment rule ---------------------------------------------
  const ceilingKm = Math.max(...weeks.map((w) => w.targetKm));
  let volumeAdjustmentPercent = 0;
  let affectedWeekCount = 0;
  const notes: string[] = [];

  if (recentCompletionRate != null) {
    const pct = Math.round(recentCompletionRate * 100);
    if (recentCompletionRate < 0.5) {
      volumeAdjustmentPercent = -20;
      affectedWeekCount = 2;
      notes.push(
        `You completed ${pct}% of scheduled sessions over the last ${weekCompletionRates.length} week(s), so the next 2 weeks' volume has been reduced ~20% to ease back in safely.`
      );
    } else if (recentCompletionRate < 0.8) {
      volumeAdjustmentPercent = -10;
      affectedWeekCount = 1;
      notes.push(
        `You completed ${pct}% of scheduled sessions recently, so next week's volume has been trimmed ~10%.`
      );
    } else if (recentCompletionRate >= 0.95 && recentAvgEffort != null && recentAvgEffort <= 5) {
      volumeAdjustmentPercent = 5;
      affectedWeekCount = 1;
      notes.push(
        `You've completed everything recently at a low reported effort (avg ${recentAvgEffort.toFixed(
          1
        )}/10), so next week's volume has been nudged up slightly.`
      );
    }
  }

  // Future, non-Race weeks are the only ones eligible for volume adjustment.
  const futureAdjustableIdx = weeks
    .map((_, idx) => idx)
    .filter((idx) => !isPastWeek[idx] && !isCurrentWeek[idx] && weeks[idx].phase !== "Race");

  const volumeScaleByWeek = new Map<number, number>(); // weekIdx -> multiplier
  futureAdjustableIdx.forEach((idx, orderPos) => {
    let target = weeks[idx].targetKm;
    let capped = false;
    if (orderPos < affectedWeekCount) {
      target = target * (1 + volumeAdjustmentPercent / 100);
      if (volumeAdjustmentPercent > 0) target = Math.min(target, ceilingKm);
    }
    if (orderPos === 0 && acwrStatus === "high" && chronicWeeklyKm > 0) {
      const cap = chronicWeeklyKm * 1.3;
      if (cap < target) {
        target = cap;
        capped = true;
      }
    }
    volumeScaleByWeek.set(idx, weeks[idx].targetKm > 0 ? target / weeks[idx].targetKm : 1);
    if (capped) {
      notes.push(
        `Your training load ratio (last 7 days vs. your trailing 4-week average) is ${acwrRatio}, above the commonly-cited 1.5 injury-risk threshold — next week's volume has been capped rather than increased further.`
      );
    }
  });

  if (acwrStatus === "elevated" && !notes.some((n) => n.includes("training load ratio"))) {
    notes.push(`Your training load ratio is ${acwrRatio} — a little elevated. Nothing capped yet, but worth easing off if it climbs further.`);
  }

  if (volumeAdjustmentPercent === 0 && acwrStatus !== "high" && recentCompletionRate != null) {
    notes.push("You're on track — following the original plan as scheduled.");
  }

  // --- Pace refresh --------------------------------------------------------
  const raceDistance = plan.raceDistance as RaceDistance;
  const targetDistanceKm = RACE_KM[raceDistance];
  const bestEffort = findBestEffort(allRuns, asOf);
  const freshPace = estimateRacePaceMinPerKm(bestEffort, targetDistanceKm);
  const effectivePaceMinPerKm = freshPace ?? plan.estimatedRacePaceMinPerKm ?? undefined;
  const observedPace = estimateObservedPaceMinPerKm(allRuns, asOf) ?? undefined;
  const paceGuidance = buildPaceGuidance(effectivePaceMinPerKm, raceDistance, unit, observedPace);

  let paceUpdated = false;
  if (freshPace != null && plan.estimatedRacePaceMinPerKm != null) {
    if (Math.abs(freshPace - plan.estimatedRacePaceMinPerKm) >= PACE_CHANGE_NOTE_THRESHOLD_MIN_PER_KM) {
      paceUpdated = true;
      const dir = freshPace < plan.estimatedRacePaceMinPerKm ? "faster" : "slower";
      notes.push(
        `Your pace zones have been refreshed from a recent best effort — projected race pace is now ${dir} than when this plan was created. Upcoming workouts reflect the update.`
      );
    }
  } else if (freshPace != null && plan.estimatedRacePaceMinPerKm == null) {
    paceUpdated = true;
    notes.push(
      "You didn't have enough run history to set real pace targets when this plan was created — now that you do, upcoming workouts include projected paces for the first time."
    );
  }

  const raceLabel = RACE_LABEL[raceDistance] ?? plan.raceDistance;
  const projectedFinishMin =
    effectivePaceMinPerKm != null ? effectivePaceMinPerKm * targetDistanceKm : null;
  const projectedFinishTime = projectedFinishMin != null ? formatFinishTime(projectedFinishMin) : null;

  if (projectedFinishTime != null) {
    // Surfaced first since it's usually the single number people care about
    // most — how this translates on race day, not just per-km pace.
    notes.unshift(
      `Based on your current fitness, you're on track for about ${projectedFinishTime} in the ${raceLabel}.`
    );
  }

  // --- Build output ---------------------------------------------------------
  const outWeeks: AdaptiveWeek[] = weeks.map((week, idx) => {
    const scale = volumeScaleByWeek.get(idx) ?? 1;
    const adjustedWeekTarget = round1(week.targetKm * scale);

    const countable = week.workouts.filter(isCountableWorkout);
    const completionRate =
      isPastWeek[idx] && countable.length > 0
        ? countable.filter((w) => w.completed).length / countable.length
        : null;

    const outWorkouts: AdaptiveWorkout[] = week.workouts.map((w) => {
      const workoutIsPast = dateOnly(w.date) < today;
      const canAdjust =
        !workoutIsPast && !w.manuallyEdited && w.type !== "Rest" && w.type !== "CrossTrain" && w.type !== "Race";

      if (!canAdjust) {
        return { ...w, originalTargetKm: w.targetKm, originalDescription: w.description, adjusted: false };
      }

      const newTargetKm = round1(w.targetKm * scale);
      const newDescription = renderDescription(w.type, w.title, newTargetKm, paceGuidance, raceDistance, unit);
      const adjusted = Math.abs(newTargetKm - w.targetKm) > 0.05 || newDescription !== w.description;

      return {
        ...w,
        targetKm: newTargetKm,
        description: newDescription,
        originalTargetKm: w.targetKm,
        originalDescription: w.description,
        adjusted,
      };
    });

    return {
      id: week.id,
      weekNumber: week.weekNumber,
      phase: week.phase,
      startDate: week.startDate,
      targetKm: adjustedWeekTarget,
      originalTargetKm: week.targetKm,
      isPast: isPastWeek[idx],
      isCurrent: isCurrentWeek[idx],
      completionRate,
      workouts: outWorkouts,
    };
  });

  return {
    weeks: outWeeks,
    summary: {
      acwr: { ratio: acwrRatio, status: acwrStatus, acuteKm: round1(acuteKm), chronicWeeklyKm: round1(chronicWeeklyKm) },
      recentCompletionRate,
      recentAvgEffort,
      volumeAdjustmentPercent,
      affectedWeekCount,
      estimatedRacePaceMinPerKm: effectivePaceMinPerKm ?? null,
      paceUpdated,
      raceLabel,
      raceDistanceKm: targetDistanceKm,
      projectedFinishMin,
      projectedFinishTime,
      notes,
    },
  };
}
