"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDistance, type UnitPreference } from "@/lib/units";

export interface LogEntry {
  id: string;
  date: string; // ISO
  distanceKm: number;
  title: string | null;
  workoutType: string | null;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Colored by training-plan workout type when a run is tied to one (matching
// the colors already used on WorkoutCard/AdaptiveInsights elsewhere in the
// app); a plain manual/imported run with no plan link falls back to the
// brand color, similar to how Strava's own log colors every "Run" the same
// green — RunTrain only ever logs runs, so there's no multi-sport legend
// here the way Strava's has one for Ride/Golf/Crossfit/etc.
const TYPE_COLORS: Record<string, string> = {
  Easy: "bg-gray-400",
  Long: "bg-blue-500",
  Tempo: "bg-orange-500",
  Intervals: "bg-red-500",
  Race: "bg-brand-600",
  CrossTrain: "bg-purple-400",
};
const DEFAULT_COLOR = "bg-brand-600";

function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekRange(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const sameMonth = monday.getMonth() === sunday.getMonth();
  const startStr = monday.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endStr = sameMonth
    ? String(sunday.getDate())
    : sunday.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${startStr} – ${endStr}`;
}

function circleSizePx(distanceKm: number, maxKm: number): number {
  const minPx = 34;
  const maxPx = 84;
  if (distanceKm <= 0 || maxKm <= 0) return minPx;
  const ratio = Math.sqrt(distanceKm / maxKm);
  return Math.round(minPx + (maxPx - minPx) * Math.min(1, ratio));
}

function yearAnchorId(year: number): string {
  return `log-year-${year}`;
}
function monthAnchorId(year: number, month: number): string {
  return `log-month-${year}-${month}`;
}

function scrollToAnchor(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function TrainingLogView({ entries, unit }: { entries: LogEntry[]; unit: UnitPreference }) {
  const currentYear = new Date().getFullYear();
  const [expandedYears, setExpandedYears] = useState<Set<number>>(() => new Set([currentYear]));

  function toggleYear(year: number) {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const maxDistanceKm = useMemo(() => entries.reduce((m, e) => Math.max(m, e.distanceKm), 1), [entries]);

  const weeks = useMemo(() => {
    if (entries.length === 0) return [];

    const byDay = new Map<string, LogEntry[]>();
    for (const e of entries) {
      const key = new Date(e.date).toDateString();
      const arr = byDay.get(key) ?? [];
      arr.push(e);
      byDay.set(key, arr);
    }

    const earliest = new Date(Math.min(...entries.map((e) => new Date(e.date).getTime())));
    const startMonday = mondayOf(earliest);
    const endMonday = mondayOf(today);

    const result: {
      weekStart: Date;
      totalKm: number;
      days: { date: Date; dayEntries: LogEntry[] }[];
    }[] = [];

    for (let d = new Date(endMonday); d.getTime() >= startMonday.getTime(); d.setDate(d.getDate() - 7)) {
      const weekStart = new Date(d);
      const days: { date: Date; dayEntries: LogEntry[] }[] = [];
      let totalKm = 0;
      for (let i = 0; i < 7; i++) {
        const dayDate = new Date(weekStart);
        dayDate.setDate(dayDate.getDate() + i);
        const dayEntries = byDay.get(dayDate.toDateString()) ?? [];
        days.push({ date: dayDate, dayEntries });
        totalKm += dayEntries.reduce((s, e) => s + e.distanceKm, 0);
      }
      result.push({ weekStart, totalKm, days });
    }
    return result;
  }, [entries, today]);

  // Sidebar navigation data: every year present, and (for the expanded
  // year(s)) every month present — built from the same descending week list
  // so the anchors line up with what's actually rendered.
  const yearMonths = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const w of weeks) {
      const y = w.weekStart.getFullYear();
      const m = w.weekStart.getMonth();
      if (!map.has(y)) map.set(y, new Set());
      map.get(y)!.add(m);
    }
    return Array.from(map.entries())
      .map(([year, months]) => ({ year, months: Array.from(months).sort((a, b) => b - a) }))
      .sort((a, b) => b.year - a.year);
  }, [weeks]);

  // First (i.e. most recent, since weeks is newest-first) week matching each
  // year/month, used to place scroll anchors exactly once per section.
  const seenYears = new Set<number>();
  const seenYearMonths = new Set<string>();

  if (entries.length === 0) {
    return (
      <div className="card p-8 text-center text-sm text-gray-500">
        No runs logged yet.{" "}
        <Link href="/import" className="font-medium text-brand-700">
          Import your history
        </Link>{" "}
        or log a run from your dashboard to see your training log here.
      </div>
    );
  }

  return (
    <div className="flex gap-8">
      <div className="min-w-0 flex-1 space-y-8">
        {weeks.map((week) => {
          const year = week.weekStart.getFullYear();
          const month = week.weekStart.getMonth();
          const isFirstOfYear = !seenYears.has(year);
          const isFirstOfMonth = !seenYearMonths.has(`${year}-${month}`);
          seenYears.add(year);
          seenYearMonths.add(`${year}-${month}`);

          return (
            <div
              key={week.weekStart.toISOString()}
              id={isFirstOfMonth ? monthAnchorId(year, month) : isFirstOfYear ? yearAnchorId(year) : undefined}
              className="scroll-mt-4"
            >
              {isFirstOfYear && <h2 className="mb-3 text-2xl font-bold text-gray-900">{year}</h2>}

              <div className="card p-4">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold text-gray-900">{formatWeekRange(week.weekStart)}</h3>
                  <p className="text-sm text-gray-500">
                    Total distance <span className="font-semibold text-gray-800">{formatDistance(week.totalKm, unit)}</span>
                  </p>
                </div>

                <div className="grid grid-cols-7 gap-2 text-center">
                  {week.days.map((day, idx) => {
                    const isFuture = day.date.getTime() > today.getTime();
                    const isToday = day.date.getTime() === today.getTime();
                    const dayTotalKm = day.dayEntries.reduce((s, e) => s + e.distanceKm, 0);
                    const primaryType = day.dayEntries[0]?.workoutType ?? null;
                    const color = primaryType ? TYPE_COLORS[primaryType] ?? DEFAULT_COLOR : DEFAULT_COLOR;
                    const size = circleSizePx(dayTotalKm, maxDistanceKm);
                    const label =
                      day.dayEntries.length > 1
                        ? `${day.dayEntries.length} runs`
                        : day.dayEntries[0]?.title || "Run";

                    return (
                      <div key={idx} className="flex flex-col items-center gap-1">
                        <span className="text-xs font-medium text-gray-400">{DAY_LABELS[idx]}</span>
                        <div className="flex h-24 items-center justify-center">
                          {day.dayEntries.length > 0 ? (
                            <Link
                              href={day.dayEntries.length === 1 ? `/activities/${day.dayEntries[0].id}` : "/activities"}
                              className={`flex items-center justify-center rounded-full text-xs font-semibold text-white transition hover:opacity-90 ${color}`}
                              style={{ width: size, height: size }}
                              title={label}
                            >
                              {formatDistance(dayTotalKm, unit, 1)}
                            </Link>
                          ) : isFuture ? (
                            <span className="text-xs text-gray-200">&middot;</span>
                          ) : isToday ? (
                            <span className="text-xs font-semibold text-brand-600">Today</span>
                          ) : (
                            <span className="text-xs text-gray-300">Rest</span>
                          )}
                        </div>
                        {day.dayEntries.length > 0 && (
                          <span className="max-w-[5.5rem] truncate text-[11px] text-gray-500" title={label}>
                            {label}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <aside className="hidden w-32 shrink-0 sm:block">
        <div className="sticky top-4 space-y-1 border-l border-gray-200 pl-4 text-sm">
          {yearMonths.map(({ year, months }) => (
            <div key={year}>
              <button
                onClick={() => {
                  toggleYear(year);
                  scrollToAnchor(yearAnchorId(year));
                }}
                className={`block w-full text-left font-semibold ${
                  expandedYears.has(year) ? "text-brand-700" : "text-gray-700 hover:text-brand-700"
                }`}
              >
                {year}
              </button>
              {expandedYears.has(year) && (
                <div className="mb-2 ml-1 mt-1 space-y-0.5">
                  {months.map((m) => (
                    <button
                      key={m}
                      onClick={() => scrollToAnchor(monthAnchorId(year, m))}
                      className="block text-left text-gray-500 hover:text-brand-700"
                    >
                      {MONTH_NAMES[m]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
