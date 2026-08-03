import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const plan = await prisma.plan.findUnique({
    where: { id: params.id },
    include: {
      weeks: {
        include: { workouts: { include: { run: true } } },
        orderBy: { weekNumber: "asc" },
      },
    },
  });

  if (!plan || plan.userId !== session.userId) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  return NextResponse.json({ plan });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const plan = await prisma.plan.findUnique({ where: { id: params.id } });
  if (!plan || plan.userId !== session.userId) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  await prisma.plan.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
