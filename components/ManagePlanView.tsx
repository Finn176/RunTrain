"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { apiFetch } from "@/lib/api";
import {
  distanceUnitLabel,
  formatDistance,
  formatDuration,
  paceFromDistanceDuration,
  toKm,
  type UnitPreference,
} from "@/lib/units";

export interface ManageWorkout {
  id: string;
  date: string; // ISO
  type: string;
  title: string;
  description: string;
  targetKm: number;
  completed: boolean;
  runDistanceKm: number | null;
  runDurationMin: number | null;
}

export interface ManageWeek {
  id: string;
  weekNumber: number;
  phase: string;
  startDate: string; // ISO, Monday
  targetKm: number;
  workouts: ManageWorkout[];
}

const WORKOUT_TYPES = ["Easy", "Long", "Tempo", "Intervals", "CrossTrain", "Race"] as const;

// Solid-color left border per type — same palette as the Training Log page
// (components/TrainingLogView.tsx) and the badge colors on WorkoutCard, so a
// "Tempo" session looks the same color everywhere in the app.
const TYPE_BORDER: Record<string, string> = {
  Easy: "border-gray-400",
  Long: "border-blue-500",
  Tempo: "border-orange-500",
  Intervals: "border-red-500",
  Race: "border-brand-600",
  CrossTrain: "border-purple-400",
};
const DEFAULT_BORDER = "border-gray-300";

function formatDayHeader(iso: string) {
  const d = new Date(iso);
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase(),
    day: d.getDate(),
  };
}

function formatWeekRange(startIso: string): string {
  const start = new Date(startIso);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function DraggableWorkout({ workout, unit }: { workout: ManageWorkout; unit: UnitPreference }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: workout.id });
  const [expanded, setExpanded] = useState(false);
  const style: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 20, position: "relative" }
    : {};

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      // A tap (no meaningful pointer movement) toggles the detail view; an
      // actual drag never reaches this — dnd-kit's PointerSensor only starts
      // a drag once the pointer clears its activationConstraint distance
      // (see WeekBlock below), so short taps and long drags never conflict.
      onClick={() => setExpanded((v) => !v)}
      className={`cursor-grab touch-none rounded-md border-l-4 bg-gray-50 px-3 py-2 active:cursor-grabbing ${
        TYPE_BORDER[workout.type] ?? DEFAULT_BORDER
      } ${isDragging ? "opacity-50" : ""}`}
    >
      <div className="flex items-center gap-1.5">
        <p className="flex-1 text-sm font-semibold text-gray-900">{workout.title}</p>
        {workout.completed && (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[10px] text-white">
            ✓
          </span>
        )}
        <span className="shrink-0 text-xs text-gray-400">{expanded ? "▾" : "▸"}</span>
      </div>
      {workout.targetKm > 0 && (
        <p className="text-xs text-gray-500">{formatDistance(workout.targetKm, unit)}</p>
      )}
      {workout.runDistanceKm != null && (
        <p className="mt-0.5 text-xs font-medium text-brand-700">
          Logged {formatDistance(workout.runDistanceKm, unit)}
        </p>
      )}
      {expanded && (
        <div className="mt-2 border-t border-gray-200 pt-2">
          <p className="text-xs leading-relaxed text-gray-600">{workout.description}</p>
          {workout.runDistanceKm != null && workout.runDurationMin != null && (
            <p className="mt-1.5 text-xs font-medium text-brand-700">
              Logged: {formatDistance(workout.runDistanceKm, unit)} in {formatDuration(workout.runDurationMin)} (
              {paceFromDistanceDuration(workout.runDistanceKm, workout.runDurationMin, unit)})
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function AddWorkoutForm({
  workoutId,
  date,
  unit,
  onDone,
}: {
  workoutId: string;
  date: string;
  unit: UnitPreference;
  onDone: () => void;
}) {
  const [type, setType] = useState<(typeof WORKOUT_TYPES)[number]>("Easy");
  const [title, setTitle] = useState("Easy Run");
  const [targetInput, setTargetInput] = useState("5");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const targetKm = toKm(Number(targetInput) || 0, unit);
      await apiFetch(`/api/workouts/${workoutId}`, {
        method: "PATCH",
        body: JSON.stringify({
          date, // keep this workout on the day it already occupies
          type,
          title,
          description: `${formatDistance(targetKm, unit)} ${type.toLowerCase()} session — added via Manage Plan.`,
          targetKm,
        }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-2 space-y-2 rounded-md border border-dashed border-gray-300 p-2">
      <div className="flex gap-2">
        <select
          className="input text-xs"
          value={type}
          onChange={(e) => setType(e.target.value as (typeof WORKOUT_TYPES)[number])}
        >
          {WORKOUT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          className="input flex-1 text-xs"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          required
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.1"
          min={0}
          className="input w-20 text-xs"
          value={targetInput}
          onChange={(e) => setTargetInput(e.target.value)}
        />
        <span className="text-xs text-gray-500">{distanceUnitLabel(unit)}</span>
        <button type="submit" className="btn ml-auto text-xs" disabled={loading}>
          {loading ? "Saving..." : "Add"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}

function DayRow({
  workout,
  unit,
  onChanged,
}: {
  workout: ManageWorkout;
  unit: UnitPreference;
  onChanged: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: workout.id });
  const [addOpen, setAddOpen] = useState(false);
  const { weekday, day } = formatDayHeader(workout.date);
  const isRest = workout.type === "Rest";

  return (
    <div
      ref={setNodeRef}
      className={`flex gap-3 border-b border-gray-100 py-2 last:border-b-0 ${isOver ? "bg-brand-50" : ""}`}
    >
      <div className="w-12 shrink-0 pt-2 text-center">
        <p className="text-[10px] font-semibold tracking-wide text-gray-400">{weekday}</p>
        <p className="text-sm font-semibold text-gray-700">{day}</p>
      </div>
      <div className="flex-1">
        {isRest ? (
          addOpen ? (
            <AddWorkoutForm
              workoutId={workout.id}
              date={workout.date}
              unit={unit}
              onDone={() => {
                setAddOpen(false);
                onChanged();
              }}
            />
          ) : (
            <button
              className="flex items-center gap-1 rounded-md px-2 py-2 text-xs font-medium text-gray-400 hover:bg-gray-50 hover:text-gray-600"
              onClick={() => setAddOpen(true)}
            >
              + Add
            </button>
          )
        ) : (
          <DraggableWorkout workout={workout} unit={unit} />
        )}
      </div>
    </div>
  );
}

function WeekBlock({ week, unit }: { week: ManageWeek; unit: UnitPreference }) {
  const router = useRouter();
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const loggedKm = week.workouts.reduce((s, w) => s + (w.runDistanceKm ?? 0), 0);

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setError(null);
    try {
      await apiFetch("/api/workouts/swap", {
        method: "PATCH",
        body: JSON.stringify({ workoutIdA: active.id, workoutIdB: over.id }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't move that workout");
    }
  }

  async function handleReset() {
    setResetting(true);
    setError(null);
    try {
      await apiFetch(`/api/weeks/${week.id}/reset`, { method: "POST" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reset this week");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="card p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900">{formatWeekRange(week.startDate)}</span>
            <span className="rounded-full bg-gray-900 px-2 py-0.5 text-xs font-semibold text-white">
              WEEK {week.weekNumber}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            Total: {formatDistance(loggedKm, unit, 1)} / {formatDistance(week.targetKm, unit, 1)}
          </p>
        </div>
        <button className="btn-secondary text-xs" onClick={handleReset} disabled={resetting}>
          {resetting ? "Resetting..." : "↻ Reset"}
        </button>
      </div>
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div>
          {week.workouts.map((w) => (
            <DayRow key={w.id} workout={w} unit={unit} onChanged={() => router.refresh()} />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

export default function ManagePlanView({
  weeks,
  unit,
}: {
  planId: string;
  weeks: ManageWeek[];
  unit: UnitPreference;
}) {
  return (
    <div className="space-y-4">
      {weeks.map((week) => (
        <WeekBlock key={week.id} week={week} unit={unit} />
      ))}
    </div>
  );
}
