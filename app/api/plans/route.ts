import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentSession, getVerifiedUser } from "@/lib/session";
import { generatePlan, ExperienceLevel, RaceDistance, RACE_KM } from "@/lib/planGenerator";
import { analyzeRunHistory } from "@/lib/runAnalysis";

const schema = z.object({
  name: z.string().min(1).max(100),
  raceDistance: z.enum(["5k", "10k", "half", "marathon"]),
  raceDate: z.string(), // ISO date
  startDate: z.string(), // ISO date
  daysPerWeek: z.number().int().min(3).max(6),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced"]),
  startingWeeklyKm: z.number().min(0).max(300),
});

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const plans = await prisma.plan.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    include: {
      weeks: {
        include: { workouts: true },
        orderBy: { weekNumber: "asc" },
      },
    },
  });
  return NextResponse.json({ plans });
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

  const raceDate = new Date(input.raceDate);
  const startDate = new Date(input.startDate);
  if (isNaN(raceDate.getTime()) || isNaN(startDate.getTime()) || raceDate <= startDate) {
    return NextResponse.json({ error: "Race date must be after the start date" }, { status: 400 });
  }

  // Tailor the plan using the athlete's real run history (manual logs +
  // Strava imports), if any: a projected race pace lets us attach concrete
  // pace targets to each workout instead of generic "easy pace" language.
  const history = await prisma.runLog.findMany({
    where: { userId: session.userId, date: { gte: new Date(Date.now() - 120 * 24 * 3600 * 1000) } },
    select: { date: true, distanceKm: true, durationMin: true },
  });
  const targetDistanceKm = RACE_KM[input.raceDistance as RaceDistance];
  const historyAnalysis = analyzeRunHistory(history, targetDistanceKm);

  const userRecord = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { unitPreference: true },
  });
  const unit = userRecord?.unitPreference === "mi" ? "mi" : "km";

  const generated = generatePlan({
    raceDistance: input.raceDistance as RaceDistance,
    raceDate,
    startDate,
    daysPerWeek: input.daysPerWeek,
    experienceLevel: input.experienceLevel as ExperienceLevel,
    startingWeeklyKm: input.startingWeeklyKm,
    estimatedRacePaceMinPerKm: historyAnalysis.estimatedRacePaceMinPerKm ?? undefined,
    observedPaceMinPerKm: historyAnalysis.observedPaceMinPerKm ?? undefined,
    unit,
  });

  const plan = await prisma.plan.create({
    data: {
      userId: session.userId,
      name: input.name,
      raceDistance: input.raceDistance,
      raceDate,
      startDate,
      daysPerWeek: input.daysPerWeek,
      experienceLevel: input.experienceLevel,
      startingWeeklyKm: input.startingWeeklyKm,
      estimatedRacePaceMinPerKm: historyAnalysis.estimatedRacePaceMinPerKm ?? null,
      weeks: {
        create: generated.map((week) => ({
          weekNumber: week.weekNumber,
          phase: week.phase,
          startDate: week.startDate,
          targetKm: week.targetKm,
          workouts: {
            create: week.workouts.map((w) => ({
              date: w.date,
              type: w.type,
              title: w.title,
              description: w.description,
              targetKm: w.targetKm,
            })),
          },
        })),
      },
    },
    include: { weeks: { include: { workouts: true }, orderBy: { weekNumber: "asc" } } },
  });

  return NextResponse.json({ plan });
}
