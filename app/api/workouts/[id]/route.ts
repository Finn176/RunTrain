import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getVerifiedUser } from "@/lib/session";

const WORKOUT_TYPES = ["Easy", "Long", "Tempo", "Intervals", "Rest", "CrossTrain", "Race"] as const;

const schema = z.object({
  date: z.string(),
  type: z.enum(WORKOUT_TYPES),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  targetKm: z.number().min(0).max(500),
});

// Manual plan editing: lets a user hand-correct a single workout's date,
// type, title, description, or target distance (e.g. swap two sessions
// around a family commitment, or fix wording they don't like). This always
// sets manuallyEdited=true, which tells the adaptive engine
// (lib/adaptivePlan.ts) to leave this workout alone forever after — the same
// way it already leaves past workouts alone — so the override sticks and
// isn't silently replaced next time paces or volume are recalculated.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getVerifiedUser();
  if (!session) {
    return NextResponse.json(
      { error: "Your login has expired or doesn't match this database. Please log out and log back in." },
      { status: 401 }
    );
  }

  const workout = await prisma.planWorkout.findUnique({
    where: { id: params.id },
    include: { week: { include: { plan: true } } },
  });
  if (!workout || workout.week.plan.userId !== session.userId) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const input = parsed.data;

  const updated = await prisma.planWorkout.update({
    where: { id: params.id },
    data: {
      date: new Date(input.date),
      type: input.type,
      title: input.title,
      description: input.description,
      targetKm: input.targetKm,
      manuallyEdited: true,
    },
  });

  return NextResponse.json({ workout: updated });
}
