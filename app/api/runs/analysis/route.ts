import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { analyzeRunHistory } from "@/lib/runAnalysis";
import { RACE_KM, RaceDistance } from "@/lib/planGenerator";

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const raceDistanceParam = req.nextUrl.searchParams.get("raceDistance") as RaceDistance | null;
  const targetDistanceKm = raceDistanceParam && RACE_KM[raceDistanceParam] ? RACE_KM[raceDistanceParam] : RACE_KM["10k"];

  // Pull a generous window of history (up to 120 days) — analyzeRunHistory
  // itself narrows to the windows it actually needs (8 weeks for volume,
  // 90 days for best-effort pace).
  const since = new Date(Date.now() - 120 * 24 * 3600 * 1000);
  const runs = await prisma.runLog.findMany({
    where: { userId: session.userId, date: { gte: since } },
    select: { date: true, distanceKm: true, durationMin: true },
    orderBy: { date: "asc" },
  });

  const analysis = analyzeRunHistory(runs, targetDistanceKm);
  return NextResponse.json({ analysis });
}
