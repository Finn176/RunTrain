import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentSession, getVerifiedUser } from "@/lib/session";

const linkSchema = z.object({
  // A workoutId links this run to that plan workout; null unlinks it (the
  // run itself is kept — only the association is removed).
  workoutId: z.string().nullable(),
});

// Manually attach (or detach) an already-logged/imported run to a specific
// plan workout — e.g. a Strava-synced run that came in without ever being
// tied to a scheduled session. This is distinct from the normal "Log run"
// flow (POST /api/runs), which creates a brand-new RunLog already linked;
// this instead re-points an *existing* RunLog's workoutId.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getVerifiedUser();
  if (!session) {
    return NextResponse.json(
      { error: "Your login has expired or doesn't match this database. Please log out and log back in." },
      { status: 401 }
    );
  }

  const run = await prisma.runLog.findUnique({ where: { id: params.id } });
  if (!run || run.userId !== session.userId) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = linkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { workoutId } = parsed.data;

  // Unlinking: clear this run's workoutId and mark the (previously linked)
  // workout as not completed again.
  if (workoutId === null) {
    if (run.workoutId) {
      await prisma.planWorkout.update({ where: { id: run.workoutId }, data: { completed: false } }).catch(() => {});
    }
    const updated = await prisma.runLog.update({ where: { id: run.id }, data: { workoutId: null } });
    return NextResponse.json({ run: updated });
  }

  // Linking: verify the target workout belongs to this user, and refuse if
  // it already has a different run attached — RunLog.workoutId is unique,
  // so silently stealing the link could orphan the other run's completed
  // status in a confusing way. Ask the user to unlink it first instead.
  const workout = await prisma.planWorkout.findUnique({
    where: { id: workoutId },
    include: { week: { include: { plan: true } }, run: true },
  });
  if (!workout || workout.week.plan.userId !== session.userId) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 });
  }
  if (workout.run && workout.run.id !== run.id) {
    return NextResponse.json(
      { error: "That workout already has a linked run — unlink it first." },
      { status: 409 }
    );
  }

  const updated = await prisma.runLog.update({
    where: { id: run.id },
    data: { workoutId, planId: run.planId ?? workout.week.plan.id },
  });
  await prisma.planWorkout.update({ where: { id: workoutId }, data: { completed: true } });

  return NextResponse.json({ run: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const run = await prisma.runLog.findUnique({ where: { id: params.id } });
  if (!run || run.userId !== session.userId) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.workoutId) {
    await prisma.planWorkout.update({ where: { id: run.workoutId }, data: { completed: false } }).catch(() => {});
  }

  await prisma.runLog.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
