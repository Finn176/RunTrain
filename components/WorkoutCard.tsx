"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  displayDistance,
  distanceUnitLabel,
  formatDistance,
  formatDuration,
  paceFromDistanceDuration,
  toKm,
  type UnitPreference,
} from "@/lib/units";

export interface WorkoutData {
  id: string;
  date: string;
  type: string;
  title: string;
  description: string;
  targetKm: number;
  completed: boolean;
  run: {
    id: string;
    distanceKm: number;
    durationMin: number;
    perceivedEffort: number | null;
    notes: string | null;
  } | null;
  // Set when the adaptive engine (lib/adaptivePlan.ts) has changed this
  // workout's target/description from what was originally generated.
  adjusted?: boolean;
  originalTargetKm?: number;
  // Set once a user has hand-edited this workout — see the schema comment
  // on PlanWorkout.manuallyEdited. Mutually exclusive with `adjusted`: the
  // adaptive engine never touches a manually-edited workout.
  manuallyEdited?: boolean;
}

const WORKOUT_TYPES = ["Easy", "Long", "Tempo", "Intervals", "Rest", "CrossTrain", "Race"] as const;

// Shape of a raw RunLog row as returned by GET /api/runs?unlinked=true —
// intentionally minimal, just enough to identify a run in a picker list.
interface UnlinkedRun {
  id: string;
  date: string;
  distanceKm: number;
  durationMin: number;
  source: string;
  title: string | null;
}

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  strava_import: "Strava",
  strava_sync: "Strava",
  garmin_import: "Garmin",
};

const TYPE_STYLES: Record<string, string> = {
  Easy: "bg-gray-100 text-gray-700",
  Long: "bg-blue-100 text-blue-700",
  Tempo: "bg-orange-100 text-orange-700",
  Intervals: "bg-red-100 text-red-700",
  Rest: "bg-gray-50 text-gray-400",
  CrossTrain: "bg-purple-100 text-purple-700",
  Race: "bg-brand-100 text-brand-700",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function toDateInputValue(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

export default function WorkoutCard({
  workout,
  planId,
  unit,
}: {
  workout: WorkoutData;
  planId: string;
  unit: UnitPreference;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [distanceInput, setDistanceInput] = useState(() =>
    (Math.round(displayDistance(workout.targetKm || 0, unit) * 100) / 100).toString()
  );
  const [durationMin, setDurationMin] = useState(0);
  const [perceivedEffort, setPerceivedEffort] = useState(5);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editDate, setEditDate] = useState(() => toDateInputValue(workout.date));
  const [editType, setEditType] = useState(workout.type);
  const [editTitle, setEditTitle] = useState(workout.title);
  const [editDescription, setEditDescription] = useState(workout.description);
  const [editTargetInput, setEditTargetInput] = useState(() =>
    (Math.round(displayDistance(workout.targetKm || 0, unit) * 100) / 100).toString()
  );
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [linkOpen, setLinkOpen] = useState(false);
  const [unlinkedRuns, setUnlinkedRuns] = useState<UnlinkedRun[] | null>(null);
  const [unlinkedLoading, setUnlinkedLoading] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [unlinkLoading, setUnlinkLoading] = useState(false);

  const isRunnable = !["Rest"].includes(workout.type);

  async function openLinkPicker() {
    setLinkError(null);
    setLinkOpen((v) => !v);
    if (!unlinkedRuns) {
      setUnlinkedLoading(true);
      try {
        const data = await apiFetch<{ runs: UnlinkedRun[] }>("/api/runs?unlinked=true");
        setUnlinkedRuns(data.runs);
      } catch (err) {
        setLinkError(err instanceof Error ? err.message : "Couldn't load your runs");
      } finally {
        setUnlinkedLoading(false);
      }
    }
  }

  async function linkRun(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRunId) return;
    setLinkError(null);
    setLinkLoading(true);
    try {
      await apiFetch(`/api/runs/${selectedRunId}`, {
        method: "PATCH",
        body: JSON.stringify({ workoutId: workout.id }),
      });
      setLinkOpen(false);
      router.refresh();
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLinkLoading(false);
    }
  }

  async function unlinkRun() {
    if (!workout.run) return;
    setUnlinkLoading(true);
    try {
      await apiFetch(`/api/runs/${workout.run.id}`, {
        method: "PATCH",
        body: JSON.stringify({ workoutId: null }),
      });
      router.refresh();
    } catch {
      // Best-effort — a stale button click failing silently is preferable
      // to interrupting the page with an error for what's a minor action.
    } finally {
      setUnlinkLoading(false);
    }
  }

  async function logRun(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch("/api/runs", {
        method: "POST",
        body: JSON.stringify({
          date: workout.date,
          distanceKm: toKm(Number(distanceInput) || 0, unit),
          durationMin,
          perceivedEffort,
          notes,
          planId,
          workoutId: workout.id,
        }),
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditError(null);
    setEditLoading(true);
    try {
      await apiFetch(`/api/workouts/${workout.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          date: new Date(editDate).toISOString(),
          type: editType,
          title: editTitle,
          description: editDescription,
          targetKm: toKm(Number(editTargetInput) || 0, unit),
        }),
      });
      setEditOpen(false);
      router.refresh();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setEditLoading(false);
    }
  }

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-400">{formatDate(workout.date)}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TYPE_STYLES[workout.type] ?? "bg-gray-100 text-gray-700"}`}>
              {workout.type}
            </span>
            {workout.completed && (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                Done
              </span>
            )}
            {workout.adjusted && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                Updated
              </span>
            )}
            {workout.manuallyEdited && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                Edited
              </span>
            )}
          </div>
          <h3 className="mt-1 font-semibold text-gray-900">{workout.title}</h3>
          <p className="mt-1 text-sm text-gray-600">{workout.description}</p>
          {workout.targetKm > 0 && (
            <p className="mt-1 text-xs font-medium text-gray-500">
              Target: {formatDistance(workout.targetKm, unit)}
              {workout.adjusted && workout.originalTargetKm != null && workout.originalTargetKm !== workout.targetKm && (
                <span className="ml-1 text-blue-600">(was {formatDistance(workout.originalTargetKm, unit)})</span>
              )}
            </p>
          )}
          {workout.run && (
            <p className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-800">
              <span>
                Logged: {formatDistance(workout.run.distanceKm, unit)} in {workout.run.durationMin}min (
                {paceFromDistanceDuration(workout.run.distanceKm, workout.run.durationMin, unit)})
                {workout.run.perceivedEffort ? ` · effort ${workout.run.perceivedEffort}/10` : ""}
              </span>
              <button
                type="button"
                className="font-semibold text-brand-700 underline hover:text-brand-900 disabled:opacity-50"
                onClick={unlinkRun}
                disabled={unlinkLoading}
              >
                {unlinkLoading ? "Unlinking..." : "Unlink"}
              </button>
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {isRunnable && !workout.completed && (
            <button className="btn-secondary text-xs" onClick={() => setOpen((v) => !v)}>
              {open ? "Cancel" : "Log run"}
            </button>
          )}
          {isRunnable && !workout.completed && (
            <button
              className="text-xs font-medium text-gray-500 hover:text-gray-700 hover:underline"
              onClick={openLinkPicker}
            >
              {linkOpen ? "Cancel link" : "Link existing run"}
            </button>
          )}
          <button
            className="text-xs font-medium text-gray-500 hover:text-gray-700 hover:underline"
            onClick={() => setEditOpen((v) => !v)}
          >
            {editOpen ? "Cancel edit" : "Edit"}
          </button>
        </div>
      </div>

      {linkOpen && (
        <form onSubmit={linkRun} className="mt-4 border-t border-gray-100 pt-4">
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Pick an already-logged run to attach to this workout
          </label>
          {unlinkedLoading && <p className="text-xs text-gray-400">Loading your runs...</p>}
          {!unlinkedLoading && unlinkedRuns && unlinkedRuns.length === 0 && (
            <p className="text-xs text-gray-400">
              No unlinked runs found — everything you've logged or imported is already attached to a workout.
            </p>
          )}
          {!unlinkedLoading && unlinkedRuns && unlinkedRuns.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="input flex-1"
                value={selectedRunId}
                onChange={(e) => setSelectedRunId(e.target.value)}
                required
              >
                <option value="" disabled>
                  Select a run...
                </option>
                {unlinkedRuns.map((r) => (
                  <option key={r.id} value={r.id}>
                    {new Date(r.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} ·{" "}
                    {formatDistance(r.distanceKm, unit)} in {formatDuration(r.durationMin)} (
                    {SOURCE_LABELS[r.source] ?? r.source})
                    {r.title ? ` — ${r.title}` : ""}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn text-xs" disabled={linkLoading || !selectedRunId}>
                {linkLoading ? "Linking..." : "Link"}
              </button>
            </div>
          )}
          {linkError && <p className="mt-2 text-sm text-red-600">{linkError}</p>}
        </form>
      )}

      {editOpen && (
        <form onSubmit={saveEdit} className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Date</label>
            <input
              type="date"
              className="input"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Type</label>
            <select
              className="input"
              value={editType}
              onChange={(e) => setEditType(e.target.value)}
            >
              {WORKOUT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">Title</label>
            <input className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Target distance ({distanceUnitLabel(unit)})
            </label>
            <input
              type="number"
              step="0.01"
              min={0}
              className="input"
              value={editTargetInput}
              onChange={(e) => setEditTargetInput(e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
            <textarea
              className="input"
              rows={3}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              required
            />
          </div>
          <p className="col-span-2 text-xs text-gray-400">
            Saving freezes this workout — future pace/volume auto-updates will skip it from now on.
          </p>
          {editError && <p className="col-span-2 text-sm text-red-600">{editError}</p>}
          <button type="submit" className="btn col-span-2" disabled={editLoading}>
            {editLoading ? "Saving..." : "Save changes"}
          </button>
        </form>
      )}

      {open && (
        <form onSubmit={logRun} className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Distance ({distanceUnitLabel(unit)})
            </label>
            <input
              type="number"
              step="0.01"
              min={0}
              className="input"
              value={distanceInput}
              onChange={(e) => setDistanceInput(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Duration (min)</label>
            <input
              type="number"
              step="0.1"
              min={0}
              className="input"
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Effort (1-10)</label>
            <input
              type="number"
              min={1}
              max={10}
              className="input"
              value={perceivedEffort}
              onChange={(e) => setPerceivedEffort(Number(e.target.value))}
            />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">Notes (optional)</label>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
          <button type="submit" className="btn col-span-2" disabled={loading}>
            {loading ? "Saving..." : "Save run"}
          </button>
        </form>
      )}
    </div>
  );
}
