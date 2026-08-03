"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { displayDistance, distanceUnitLabel, formatDistance, formatPace, toKm, type UnitPreference } from "@/lib/units";

interface HistoryAnalysis {
  hasData: boolean;
  weeksWithActivity: number;
  avgWeeklyKm: number;
  avgRunsPerWeek: number;
  suggestedDaysPerWeek: number;
  suggestedExperienceLevel: string;
  suggestedStartingWeeklyKm: number;
  estimatedRacePaceMinPerKm: number | null;
}

const RACE_OPTIONS = [
  { value: "5k", label: "5K" },
  { value: "10k", label: "10K" },
  { value: "half", label: "Half Marathon" },
  { value: "marathon", label: "Marathon" },
];

const EXPERIENCE_OPTIONS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultRaceDateIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 84); // ~12 weeks out
  return d.toISOString().slice(0, 10);
}

export default function PlanForm({ unit }: { unit: UnitPreference }) {
  const router = useRouter();
  const [name, setName] = useState("My Training Plan");
  const [raceDistance, setRaceDistance] = useState("10k");
  const [raceDate, setRaceDate] = useState(defaultRaceDateIso());
  const [startDate, setStartDate] = useState(todayIso());
  const [daysPerWeek, setDaysPerWeek] = useState(4);
  const [experienceLevel, setExperienceLevel] = useState("intermediate");
  const [weeklyMileageInput, setWeeklyMileageInput] = useState(() =>
    (Math.round(displayDistance(20, unit) * 10) / 10).toString()
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<HistoryAnalysis | null>(null);
  const [appliedPrefill, setAppliedPrefill] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/runs/analysis?raceDistance=${raceDistance}`)
      .then((r) => r.json())
      .then((data: { analysis: HistoryAnalysis }) => {
        if (cancelled || !data?.analysis) return;
        setAnalysis(data.analysis);
        if (!appliedPrefill && data.analysis.hasData) {
          setWeeklyMileageInput(
            (Math.round(displayDistance(data.analysis.suggestedStartingWeeklyKm, unit) * 10) / 10).toString()
          );
          setDaysPerWeek(data.analysis.suggestedDaysPerWeek);
          setExperienceLevel(data.analysis.suggestedExperienceLevel);
          setAppliedPrefill(true);
        }
      })
      .catch(() => {
        // Non-fatal — the form still works fine with manual defaults.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceDistance]);

  const weeksAvailable = Math.round(
    (new Date(raceDate).getTime() - new Date(startDate).getTime()) / (7 * 24 * 3600 * 1000)
  );
  const tooSoon = weeksAvailable < 4;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (tooSoon) {
      setError("Pick a race date at least 4 weeks after your start date.");
      return;
    }
    setLoading(true);
    try {
      const { plan } = await apiFetch<{ plan: { id: string } }>("/api/plans", {
        method: "POST",
        body: JSON.stringify({
          name,
          raceDistance,
          raceDate,
          startDate,
          daysPerWeek,
          experienceLevel,
          startingWeeklyKm: toKm(Number(weeklyMileageInput) || 0, unit),
        }),
      });
      router.push(`/plan/${plan.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card mx-auto max-w-xl space-y-5 p-6">
      {analysis?.hasData && (
        <div className="rounded-lg bg-brand-50 p-3 text-xs text-brand-800">
          Based on your last {analysis.weeksWithActivity} week{analysis.weeksWithActivity === 1 ? "" : "s"} of logged
          runs: ~{formatDistance(analysis.avgWeeklyKm, unit)}/week, ~{analysis.avgRunsPerWeek} runs/week
          {analysis.estimatedRacePaceMinPerKm
            ? `, projected race pace ~${formatPace(analysis.estimatedRacePaceMinPerKm, unit)}`
            : ""}
          . We've pre-filled the fields below using this &mdash; feel free to adjust them.
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Plan name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Goal race</label>
        <select className="input" value={raceDistance} onChange={(e) => setRaceDistance(e.target.value)}>
          {RACE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Plan start date</label>
          <input
            type="date"
            className="input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Race date</label>
          <input
            type="date"
            className="input"
            value={raceDate}
            onChange={(e) => setRaceDate(e.target.value)}
            required
          />
        </div>
      </div>

      <p className="text-xs text-gray-500">
        {weeksAvailable > 0 ? `${weeksAvailable} weeks until race day.` : "Race date must be after the start date."}
      </p>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Days per week you can run: <span className="font-semibold">{daysPerWeek}</span>
        </label>
        <input
          type="range"
          min={3}
          max={6}
          value={daysPerWeek}
          onChange={(e) => setDaysPerWeek(Number(e.target.value))}
          className="w-full"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Experience level</label>
        <select
          className="input"
          value={experienceLevel}
          onChange={(e) => setExperienceLevel(e.target.value)}
        >
          {EXPERIENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Current weekly mileage ({distanceUnitLabel(unit)})
        </label>
        <input
          type="number"
          min={0}
          max={unit === "mi" ? 186 : 300}
          step={0.5}
          className="input"
          value={weeklyMileageInput}
          onChange={(e) => setWeeklyMileageInput(e.target.value)}
          required
        />
        <p className="mt-1 text-xs text-gray-500">
          Roughly how many {distanceUnitLabel(unit)} you're running per week right now.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" className="btn w-full" disabled={loading || tooSoon}>
        {loading ? "Building your plan..." : "Generate my plan"}
      </button>
    </form>
  );
}
