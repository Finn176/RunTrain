import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentSession, getCurrentUserPrefs } from "@/lib/session";
import TrainingLogView from "@/components/TrainingLogView";

export default async function TrainingLogPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const prefs = await getCurrentUserPrefs();
  const unit = prefs?.unitPreference ?? "km";

  const runs = await prisma.runLog.findMany({
    where: { userId: session.userId },
    orderBy: { date: "asc" },
    include: { workout: { select: { type: true } } },
  });

  const entries = runs.map((r) => ({
    id: r.id,
    date: r.date.toISOString(),
    distanceKm: r.distanceKm,
    title: r.title,
    workoutType: r.workout?.type ?? null,
  }));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Training Log</h1>
      <TrainingLogView entries={entries} unit={unit} />
    </div>
  );
}
