import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getVerifiedUser } from "@/lib/session";

// Restores every workout in this week back to whichever day it was
// originally generated onto — undoes any drag-and-drop rearranging done on
// the Manage Plan screen (components/ManagePlanView.tsx), regardless of how
// many moves happened since. Workouts that were never moved (originalDate
// still null) are left untouched — there's nothing to reset.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getVerifiedUser();
  if (!session) {
    return NextResponse.json(
      { error: "Your login has expired or doesn't match this database. Please log out and log back in." },
      { status: 401 }
    );
  }

  const week = await prisma.planWeek.findUnique({
    where: { id: params.id },
    include: { plan: true, workouts: true },
  });
  if (!week || week.plan.userId !== session.userId) {
    return NextResponse.json({ error: "Week not found" }, { status: 404 });
  }

  const toRestore = week.workouts.filter((w) => w.originalDate != null);
  await prisma.$transaction(
    toRestore.map((w) =>
      prisma.planWorkout.update({
        where: { id: w.id },
        data: { date: w.originalDate as Date, originalDate: null },
      })
    )
  );

  return NextResponse.json({ ok: true, restoredCount: toRestore.length });
}
