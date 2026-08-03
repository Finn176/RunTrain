import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentSession, getCurrentUserPrefs } from "@/lib/session";
import WorkoutCard from "@/components/WorkoutCard";
import AdaptiveInsights from "@/components/AdaptiveInsights";
import { computeAdaptivePlan } from "@/lib/adaptivePlan";
import { shouldAutoSync, syncStravaForUser } from "@/lib/stravaSync";

export default async function DashboardPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const prefs = await getCurrentUserPrefs();
  const unit = prefs?.unitPreference ?? "km";

  // Auto-sync from Strava (if connected), throttled so ordinary page
  // navigation doesn't repeatedly hit Strava's API — see shouldAutoSync's
  // comment. Best-effort: a sync failure here (expired token, Strava outage,
  // etc.) shouldn't break the dashboard itself; the Import page surfaces
  // connection problems more visibly via its own status check.
  const stravaAccount = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { stravaRefreshToken: true, stravaLastSyncAt: true },
  });
  if (stravaAccount?.stravaRefreshToken && shouldAutoSync(stravaAccount.stravaLastSyncAt)) {
    try {
      await syncStravaForUser(session.userId);
    } catch {
      // Swallow — see comment above.
    }
  }

  const plans = await prisma.plan.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    include: {
      weeks: {
        include: { workouts: { include: { run: true }, orderBy: { date: "asc" } } },
        orderBy: { weekNumber: "asc" },
      },
    },
  });

  if (plans.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Welcome, {session.name.split(" ")[0]}!</h1>
        <p className="mt-2 text-gray-600">You don&rsquo;t have a training plan yet. Let&rsquo;s build one.</p>
        <Link href="/plan/new" className="btn mt-6 inline-flex">
          Create your first plan
        </Link>
        <p className="mt-4 text-sm text-gray-500">
          Have run history on Strava or Garmin?{" "}
          <Link href="/import" className="font-medium text-brand-700">
            Import it first
          </Link>{" "}
          so your plan is built around your real training.
        </p>
      </div>
    );
  }

  const activePlan = plans.find((p) => new Date(p.raceDate) >= new Date()) ?? plans[0];
  const now = new Date();

  const allRuns = await prisma.runLog.findMany({
    where: { userId: session.userId },
    select: { date: true, distanceKm: true, durationMin: true },
  });
  const { weeks: adaptiveWeeks, summary } = computeAdaptivePlan(activePlan, allRuns, new Date(), unit);
  const currentWeek = adaptiveWeeks.find((w) => w.isCurrent) ?? adaptiveWeeks[0];

  const daysToRace = Math.ceil((new Date(activePlan.raceDate).getTime() - now.getTime()) / (24 * 3600 * 1000));

  return (
    <div className="space-y-8">
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Active plan</p>
          <h1 className="text-xl font-bold text-gray-900">{activePlan.name}</h1>
          <p className="text-sm text-gray-500">
            {activePlan.raceDistance.toUpperCase()} in {daysToRace > 0 ? `${daysToRace} days` : "the books"} &middot;
            Week {currentWeek?.weekNumber} of {activePlan.weeks.length} ({currentWeek?.phase})
          </p>
        </div>
        <Link href={`/plan/${activePlan.id}`} className="btn-secondary">
          View full plan
        </Link>
      </div>

      <AdaptiveInsights summary={summary} unit={unit} />

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">This week</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {currentWeek?.workouts.map((w) => (
            <WorkoutCard
              key={w.id}
              planId={activePlan.id}
              unit={unit}
              workout={{
                id: w.id,
                date: w.date.toISOString(),
                type: w.type,
                title: w.title,
                description: w.description,
                targetKm: w.targetKm,
                completed: w.completed,
                run: w.run
                  ? {
                      id: w.run.id,
                      distanceKm: w.run.distanceKm,
                      durationMin: w.run.durationMin,
                      perceivedEffort: w.run.perceivedEffort,
                      notes: w.run.notes,
                    }
                  : null,
                adjusted: w.adjusted,
                originalTargetKm: w.originalTargetKm,
                manuallyEdited: w.manuallyEdited,
              }}
            />
          ))}
        </div>
      </div>

      {plans.length > 1 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">All plans</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {plans.map((p) => (
              <Link key={p.id} href={`/plan/${p.id}`} className="card p-4 hover:border-brand-300">
                <p className="font-semibold text-gray-900">{p.name}</p>
                <p className="text-sm text-gray-500">
                  {p.raceDistance.toUpperCase()} &middot;{" "}
                  {new Date(p.raceDate).toLocaleDateString(undefined, { dateStyle: "medium" })}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div>
        <Link href="/plan/new" className="text-sm font-medium text-brand-700">
          + Create another plan
        </Link>
      </div>
    </div>
  );
}
