import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentSession, getCurrentUserPrefs } from "@/lib/session";
import ManagePlanView from "@/components/ManagePlanView";

// Structural editing view — day placement only. Unlike the main plan page
// (app/plan/[id]/page.tsx), this deliberately shows the plan's raw stored
// data rather than running it through the adaptive engine: rearranging days
// is a plan-structure action, not a "what should I run today" question.
export default async function ManagePlanPage({ params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const plan = await prisma.plan.findUnique({
    where: { id: params.id },
    include: {
      weeks: {
        include: {
          workouts: {
            include: { run: { select: { distanceKm: true, durationMin: true } } },
            orderBy: { date: "asc" },
          },
        },
        orderBy: { weekNumber: "asc" },
      },
    },
  });

  if (!plan || plan.userId !== session.userId) notFound();

  const prefs = await getCurrentUserPrefs();
  const unit = prefs?.unitPreference ?? "km";

  const weeks = plan.weeks.map((w) => ({
    id: w.id,
    weekNumber: w.weekNumber,
    phase: w.phase,
    startDate: w.startDate.toISOString(),
    targetKm: w.targetKm,
    workouts: w.workouts.map((wo) => ({
      id: wo.id,
      date: wo.date.toISOString(),
      type: wo.type,
      title: wo.title,
      description: wo.description,
      targetKm: wo.targetKm,
      completed: wo.completed,
      runDistanceKm: wo.run?.distanceKm ?? null,
      runDurationMin: wo.run?.durationMin ?? null,
    })),
  }));

  return (
    <div>
      <Link href={`/plan/${plan.id}`} className="mb-4 inline-block text-sm font-medium text-brand-700 hover:underline">
        ← Back to {plan.name}
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Manage Plan</h1>
      <p className="mb-6 text-sm text-gray-500">
        Drag a workout onto a different day to swap it with whatever's there. Tap{" "}
        <span className="font-medium">+ Add</span> on a rest day to schedule something there instead. Each
        week's <span className="font-medium">Reset</span> button undoes any moves in that week.
      </p>
      <ManagePlanView planId={plan.id} weeks={weeks} unit={unit} />
    </div>
  );
}
