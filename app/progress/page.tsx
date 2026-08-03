"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import MultiSelectDropdown from "@/components/MultiSelectDropdown";
import { displayDistance, distanceUnitLabel, paceUnitHeading, type UnitPreference } from "@/lib/units";

interface Run {
  id: string;
  date: string;
  distanceKm: number;
  durationMin: number;
  perceivedEffort: number | null;
  title: string | null;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function paceForUnit(distanceKm: number, durationMin: number, unit: UnitPreference): number | null {
  if (!distanceKm) return null;
  const distanceInUnit = displayDistance(distanceKm, unit);
  if (!distanceInUnit) return null;
  return durationMin / distanceInUnit;
}

// Formats a pace value that is ALREADY expressed in the target display unit
// (unlike lib/units.ts's formatPaceValue, which expects a canonical
// min-per-km value and converts it). The chart data here is pre-converted
// via paceForUnit, so this just renders M:SS without any further conversion.
function formatPaceDisplay(p: number | null): string {
  if (p == null || !isFinite(p)) return "-";
  const totalSeconds = Math.round(p * 60);
  const min = Math.floor(totalSeconds / 60);
  const sec = (totalSeconds % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

export default function ProgressPage() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useState<UnitPreference>("km");

  const [selectedYears, setSelectedYears] = useState<string[]>([]); // empty = all years
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]); // empty = all months, values "1"-"12"
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/runs")
      .then((r) => r.json())
      .then((data) => setRuns(data.runs ?? []))
      .catch(() => setError("Couldn't load your runs"));
    fetch("/api/user/preferences")
      .then((r) => r.json())
      .then((data) => {
        if (data?.preferences?.unitPreference === "mi") setUnit("mi");
      })
      .catch(() => {
        // Non-fatal — fall back to km display.
      });
  }, []);

  const years = useMemo(() => {
    if (!runs) return [];
    return Array.from(new Set(runs.map((r) => new Date(r.date).getFullYear()))).sort((a, b) => a - b);
  }, [runs]);

  const yearOptions = useMemo(() => years.map((y) => ({ value: String(y), label: String(y) })), [years]);
  const monthOptions = useMemo(
    () => MONTH_NAMES.map((name, idx) => ({ value: String(idx + 1), label: name })),
    []
  );

  const filteredRuns = useMemo(() => {
    if (!runs) return [];
    const term = search.trim().toLowerCase();
    return runs.filter((r) => {
      const d = new Date(r.date);
      if (selectedYears.length > 0 && !selectedYears.includes(String(d.getFullYear()))) return false;
      if (selectedMonths.length > 0 && !selectedMonths.includes(String(d.getMonth() + 1))) return false;
      if (term && !(r.title ?? "").toLowerCase().includes(term)) return false;
      return true;
    });
  }, [runs, selectedYears, selectedMonths, search]);

  const weeklyData = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredRuns) {
      const key = mondayOf(new Date(r.date)).toISOString().slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + r.distanceKm);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, km]) => ({
        week: new Date(week).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        dist: Math.round(displayDistance(km, unit) * 10) / 10,
      }));
  }, [filteredRuns, unit]);

  const paceData = useMemo(() => {
    return [...filteredRuns]
      .filter((r) => r.distanceKm > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({
        date: new Date(r.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        pace: Math.round((paceForUnit(r.distanceKm, r.durationMin, unit) ?? 0) * 100) / 100,
      }));
  }, [filteredRuns, unit]);

  const totals = useMemo(() => {
    const totalKm = filteredRuns.reduce((s, r) => s + r.distanceKm, 0);
    const efforts = filteredRuns.map((r) => r.perceivedEffort).filter((e): e is number => e != null);
    const avgEffort = efforts.length ? efforts.reduce((s, e) => s + e, 0) / efforts.length : null;
    return {
      totalDist: Math.round(displayDistance(totalKm, unit) * 10) / 10,
      totalRuns: filteredRuns.length,
      avgEffort,
    };
  }, [filteredRuns, unit]);

  const hasActiveFilters = selectedYears.length > 0 || selectedMonths.length > 0 || search.trim().length > 0;

  function clearFilters() {
    setSelectedYears([]);
    setSelectedMonths([]);
    setSearch("");
  }

  if (error) return <p className="text-red-600">{error}</p>;
  if (!runs) return <p className="text-gray-500">Loading...</p>;

  if (runs.length === 0) {
    return (
      <div className="py-16 text-center text-gray-500">
        <p>No runs logged yet. Log a run from your dashboard or plan to see progress here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Progress</h1>

      <div className="card p-4">
        <div className="grid gap-6 sm:grid-cols-2">
          <MultiSelectDropdown
            label="Year"
            options={yearOptions}
            selected={selectedYears}
            onChange={setSelectedYears}
            allLabel="All years"
          />
          <MultiSelectDropdown
            label="Month"
            options={monthOptions}
            selected={selectedMonths}
            onChange={setSelectedMonths}
            allLabel="All months"
          />
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium text-gray-700">Search activity name</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. Morning Run"
            className="input"
          />
        </div>

        {hasActiveFilters && (
          <button onClick={clearFilters} className="mt-3 text-xs font-medium text-gray-500 hover:text-gray-800">
            Clear filters
          </button>
        )}
      </div>

      {filteredRuns.length === 0 ? (
        <div className="card p-8 text-center text-sm text-gray-500">
          No activities match these filters.{" "}
          <button onClick={clearFilters} className="font-medium text-brand-700 hover:underline">
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="card p-4 text-center">
              <p className="text-2xl font-bold text-brand-700">{totals.totalDist}</p>
              <p className="text-xs text-gray-500">Total {distanceUnitLabel(unit)} logged</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-2xl font-bold text-brand-700">{totals.totalRuns}</p>
              <p className="text-xs text-gray-500">Runs logged</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-2xl font-bold text-brand-700">{totals.avgEffort?.toFixed(1) ?? "-"}</p>
              <p className="text-xs text-gray-500">Avg. perceived effort</p>
            </div>
          </div>

          <div className="card p-4">
            <h2 className="mb-3 font-semibold text-gray-900">Weekly distance ({distanceUnitLabel(unit)})</h2>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="dist" fill="#16a34a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card p-4">
            <h2 className="mb-3 font-semibold text-gray-900">Pace trend ({paceUnitHeading(unit)}, lower is faster)</h2>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={paceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} reversed domain={["dataMin - 0.5", "dataMax + 0.5"]} />
                  <Tooltip formatter={(v: number) => formatPaceDisplay(v)} />
                  <Line type="monotone" dataKey="pace" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
