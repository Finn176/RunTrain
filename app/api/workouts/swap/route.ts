import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getVerifiedUser } from "@/lib/session";

const schema = z.object({
  workoutIdA: z.string(),
  workoutIdB: z.string(),
});

// Powers drag-and-drop on the Manage Plan screen (components/ManagePlanView.tsx):
// dragging a workout onto a different day swaps that workout's date with
// whatever was already on the destination day, rather than creating or
// deleting rows. This keeps everything else about each workout — its
// content, its completed/linked-run status — attached to the same row, so a
// logged run correctly "follows" its workout to its new day.
//
// The first time either workout's date is ever touched this way, its
// pre-move date is captured in originalDate (if not already set) so a
// week's "Reset" button can restore the originally-generated layout later,
// no matter how many moves happen in between.
export async function PATCH(req: NextRequest) {
  const session = await getVerifiedUser();
  if (!session) {
    return NextResponse.json(
      { error: "Your login has expired or doesn't match this database. Please log out and log back in." },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { workoutIdA, workoutIdB } = parsed.data;
  if (workoutIdA === workoutIdB) {
    return NextResponse.json({ error: "Can't swap a workout with itself" }, { status: 400 });
  }

  const [a, b] = await Promise.all([
    prisma.planWorkout.findUnique({ where: { id: workoutIdA }, include: { week: { include: { plan: true } } } }),
    prisma.planWorkout.findUnique({ where: { id: workoutIdB }, include: { week: { include: { plan: true } } } }),
  ]);

  if (!a || !b || a.week.plan.userId !== session.userId || b.week.plan.userId !== session.userId) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 });
  }
  // Restricted to the same week/plan — the Manage Plan screen only ever
  // renders drag targets within one week's row, so this is a defensive
  // check against a tampered request rather than something the UI needs.
  if (a.weekId !== b.weekId) {
    return NextResponse.json({ error: "Can only rearrange workouts within the same week" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.planWorkout.update({
      where: { id: a.id },
      data: { date: b.date, originalDate: a.originalDate ?? a.date },
    }),
    prisma.planWorkout.update({
      where: { id: b.id },
      data: { date: a.date, originalDate: b.originalDate ?? b.date },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
