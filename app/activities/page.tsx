import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentSession, getCurrentUserPrefs } from "@/lib/session";
import { formatDistance, formatDuration, paceFromDistanceDuration } from "@/lib/units";

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

export default async function ActivitiesPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const prefs = await getCurrentUserPrefs();
  const unit = prefs?.unitPreference ?? "km";

  const runs = await prisma.runLog.findMany({
    where: { userId: session.userId },
    orderBy: { date: "desc" },
    include: {
      workout: { select: { title: true, type: true } },
      plan: { select: { id: true, name: true } },
    },
  });

  const totalKm = runs.reduce((s, r) => s + r.distanceKm, 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All activities</h1>
          <p className="mt-1 text-sm text-gray-500">
            {runs.length} run{runs.length === 1 ? "" : "s"} logged &middot; {formatDistance(totalKm, unit)} total
          </p>
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="card p-8 text-center text-sm text-gray-500">
          No activities yet.{" "}
          <Link href="/import" className="font-medium text-brand-700">
            Import your history
          </Link>{" "}
          or log a run from your dashboard to see it here.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Distance</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Pace</th>
                <th className="px-4 py-3 font-medium">Effort</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Plan / workout</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.map((run) => (
                <tr key={run.id} className="cursor-pointer hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                    <Link href={`/activities/${run.id}`} className="block">
                      {new Date(run.date).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                    <Link href={`/activities/${run.id}`} className="block">
                      {formatDistance(run.distanceKm, unit)}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                    <Link href={`/activities/${run.id}`} className="block">
                      {formatDuration(run.durationMin)}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                    <Link href={`/activities/${run.id}`} className="block">
                      {paceFromDistanceDuration(run.distanceKm, run.durationMin, unit)}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                    <Link href={`/activities/${run.id}`} className="block">
                      {run.perceivedEffort ? `${run.perceivedEffort}/10` : "-"}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link href={`/activities/${run.id}`} className="block">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          SOURCE_STYLES[run.source] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {SOURCE_LABELS[run.source] ?? run.source}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {run.plan ? (
                      <Link href={`/plan/${run.plan.id}`} className="text-brand-700 hover:underline">
                        {run.workout?.title ?? run.plan.name}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
