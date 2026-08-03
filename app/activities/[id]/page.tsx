import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentSession, getCurrentUserPrefs } from "@/lib/session";
import DeleteRunButton from "@/components/DeleteRunButton";
import RouteMap from "@/components/RouteMap";
import { formatDistance, formatDuration, formatElevation, paceFromDistanceDuration } from "@/lib/units";

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  strava_import: "Strava",
  strava_sync: "Strava",
  garmin_import: "Garmin",
};

const SOURCE_STYLES: Record<string, string> = {
  manual: "bg-gray-100 text-gray-700",
  strava_import: "bg-orange-100 text-orange-700",
  strava_sync: "bg-orange-100 text-orange-700",
  garmin_import: "bg-blue-100 text-blue-700",
};

export default async function ActivityDetailPage({ params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const prefs = await getCurrentUserPrefs();
  const unit = prefs?.unitPreference ?? "km";

  const run = await prisma.runLog.findUnique({
    where: { id: params.id },
    include: {
      workout: { select: { title: true, type: true } },
      plan: { select: { id: true, name: true } },
    },
  });

  if (!run || run.userId !== session.userId) notFound();

  const heading = run.title || run.workout?.title || "Run";

  const stats: { label: string; value: string }[] = [
    { label: "Distance", value: formatDistance(run.distanceKm, unit) },
    { label: "Duration", value: formatDuration(run.durationMin) },
    { label: "Pace", value: paceFromDistanceDuration(run.distanceKm, run.durationMin, unit) },
  ];
  if (run.elevationGainM != null) {
    stats.push({ label: "Elevation gain", value: formatElevation(run.elevationGainM, unit) });
  }
  if (run.calories != null) {
    stats.push({ label: "Calories", value: `${Math.round(run.calories)} kcal` });
  }
  if (run.perceivedEffort != null) {
    stats.push({ label: "Effort", value: `${run.perceivedEffort}/10` });
  }

  return (
    <div>
      <Link href="/activities" className="mb-4 inline-block text-sm font-medium text-brand-700 hover:underline">
        ← Back to activities
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                SOURCE_STYLES[run.source] ?? "bg-gray-100 text-gray-700"
              }`}
            >
              {SOURCE_LABELS[run.source] ?? run.source}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{heading}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {new Date(run.date).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
            {" · "}
            {new Date(run.date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </p>
        </div>
        <DeleteRunButton runId={run.id} />
      </div>

      <div className="card mb-6 grid grid-cols-2 gap-4 p-6 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{s.label}</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      {run.routePolyline && (
        <div className="card mb-6 overflow-hidden p-2">
          <RouteMap polyline={run.routePolyline} />
        </div>
      )}

      {run.notes && (
        <div className="card mb-6 p-6">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Notes</p>
          <p className="whitespace-pre-wrap text-sm text-gray-700">{run.notes}</p>
        </div>
      )}

      {run.plan && (
        <div className="card p-6">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Plan</p>
          <Link href={`/plan/${run.plan.id}`} className="text-sm font-medium text-brand-700 hover:underline">
            {run.workout?.title ?? run.plan.name}
          </Link>
        </div>
      )}
    </div>
  );
}
