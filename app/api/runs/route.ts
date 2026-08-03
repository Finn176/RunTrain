import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentSession, getVerifiedUser } from "@/lib/session";

const schema = z.object({
  date: z.string(),
  distanceKm: z.number().min(0).max(500),
  durationMin: z.number().min(0).max(1500),
  perceivedEffort: z.number().int().min(1).max(10).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  planId: z.string().optional().nullable(),
  workoutId: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const planId = req.nextUrl.searchParams.get("planId");
  const unlinked = req.nextUrl.searchParams.get("unlinked") === "true";

  const runs = await prisma.runLog.findMany({
    where: {
      userId: session.userId,
      ...(planId ? { planId } : {}),
      // "Unlinked" = not already attached to a specific plan workout — the
      // set a user picks from when manually linking an existing import
      // (e.g. a Strava-synced run) to a workout via WorkoutCard's
      // "Link existing run" control.
      ...(unlinked ? { workoutId: null } : {}),
    },
    // The unlinked-runs picker wants the most recent first (you're almost
    // always linking a run you just did); every other existing caller of
    // this endpoint (e.g. the progress charts) already re-sorts/re-groups
    // whatever order it gets, so this only changes behavior for that case.
    orderBy: { date: unlinked ? "desc" : "asc" },
    // A generous but bounded window — this is a picker list for manual
    // linking, not a full history view (that's the Activities/Log pages).
    ...(unlinked ? { take: 60 } : {}),
  });
  return NextResponse.json({ runs });
}

export async function POST(req: NextRequest) {
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
  const input = parsed.data;

  if (input.workoutId) {
    const workout = await prisma.planWorkout.findUnique({
      where: { id: input.workoutId },
      include: { week: { include: { plan: true } } },
    });
    if (!workout || workout.week.plan.userId !== session.userId) {
      return NextResponse.json({ error: "Workout not found" }, { status: 404 });
    }
  }

  const run = await prisma.runLog.create({
    data: {
      userId: session.userId,
      planId: input.planId ?? null,
      workoutId: input.workoutId ?? null,
      date: new Date(input.date),
      distanceKm: input.distanceKm,
      durationMin: input.durationMin,
      perceivedEffort: input.perceivedEffort ?? null,
      notes: input.notes ?? null,
    },
  });

  if (input.workoutId) {
    await prisma.planWorkout.update({ where: { id: input.workoutId }, data: { completed: true } });
  }

  return NextResponse.json({ run });
}
