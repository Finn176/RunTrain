import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentSession, getCurrentUserPrefs } from "@/lib/session";
import WorkoutCard from "@/components/WorkoutCard";
import DeletePlanButton from "@/components/DeletePlanButton";
import AdaptiveInsights from "@/components/AdaptiveInsights";
import { computeAdaptivePlan } from "@/lib/adaptivePlan";
import { formatDistance } from "@/lib/units";

const PHASE_COLORS: Record<string, string> = {
  Base: "border-gray-300",
  Build: "border-blue-300",
  Peak: "border-orange-300",
  Taper: "border-purple-300",
  Race: "border-brand-500",
};

export default async function PlanDetailPage({ params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const plan = await prisma.plan.findUnique({
    where: { id: params.id },
    include: {
      weeks: {
        include: { workouts: { include: { run: true }, orderBy: { date: "asc" } } },
        orderBy: { weekNumber: "asc" },
      },
    },
  });

  if (!plan || plan.userId !== session.userId) notFound();

  const prefs = await getCurrentUserPrefs();
  const unit = prefs?.unitPreference ?? "km";

  // Pull every run the athlete has logged (any source, any plan) since
  // training-load and pace calculations should reflect real total training,
  // not just sessions logged against this specific plan.
  const allRuns = await prisma.runLog.findMany({
    where: { userId: session.userId },
    select: { date: true, distanceKm: true, durationMin: true },
  });

  const { weeks: adaptiveWeeks, summary } = computeAdaptivePlan(plan, allRuns, new Date(), unit);

  const totalWorkouts = adaptiveWeeks.flatMap((w) => w.workouts).filter((w) => w.type !== "Rest").length;
  const completedWorkouts = adaptiveWeeks
    .flatMap((w) => w.workouts)
    .filter((w) => w.type !== "Rest" && w.completed).length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{plan.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {plan.raceDistance.toUpperCase()} &middot; Race day{" "}
            {new Date(plan.raceDate).toLocaleDateString(undefined, { dateStyle: "medium" })} &middot;{" "}
            {plan.weeks.length} weeks &middot; {plan.daysPerWeek} days/week
          </p>
          <p className="mt-1 text-xs font-medium text-brand-700">
            {completedWorkouts}/{totalWorkouts} workouts completed
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href={`/plan/${plan.id}/manage`} className="btn-secondary">
            Manage Plan
          </Link>
          <DeletePlanButton planId={plan.id} />
        </div>
      </div>

      <div className="mb-6">
        <AdaptiveInsights summary={summary} unit={unit} />
      </div>

      <div className="space-y-4">
        {adaptiveWeeks.map((week) => (
          <details
            key={week.id}
            open={week.isCurrent}
            className={`card border-l-4 p-4 ${PHASE_COLORS[week.phase] ?? "border-gray-300"}`}
          >
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-gray-900">Week {week.weekNumber}</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {week.phase}
                  </span>
                  {week.isCurrent && (
                    <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
                      This week
                    </span>
                  )}
                </div>
                <span className="text-sm text-gray-500">
                  {new Date(week.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })} &middot;
                  Target {formatDistance(week.targetKm, unit)}
                  {Math.abs(week.targetKm - week.originalTargetKm) > 0.05 && (
                    <span className="ml-1 text-xs font-medium text-brand-700">
                      (was {formatDistance(week.originalTargetKm, unit)})
                    </span>
                  )}
                </span>
              </div>
            </summary>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {week.workouts.map((w) => (
                <WorkoutCard
                  key={w.id}
                  planId={plan.id}
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
          </details>
        ))}
      </div>
    </div>
  );
}
