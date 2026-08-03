import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getVerifiedUser } from "@/lib/session";
import { parseGarminActivitiesCsv } from "@/lib/garminImport";

const schema = z.object({
  csv: z.string().min(1, "The CSV file appears to be empty"),
  distanceUnit: z.enum(["km", "mi"]),
});

const MAX_CSV_LENGTH = 25_000_000; // ~25MB, generous for even a large multi-year export

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
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  if (parsed.data.csv.length > MAX_CSV_LENGTH) {
    return NextResponse.json({ error: "That file is too large to import." }, { status: 400 });
  }

  const result = parseGarminActivitiesCsv(parsed.data.csv, parsed.data.distanceUnit);

  if (result.runs.length === 0) {
    return NextResponse.json({
      imported: 0,
      updated: 0,
      skippedNonRun: result.nonRunRows,
      skippedInvalid: result.invalidRows,
      totalRows: result.totalRows,
    });
  }

  const externalIds = result.runs.map((r) => r.externalId);
  const existing = await prisma.runLog.findMany({
    where: { userId: session.userId, externalId: { in: externalIds } },
    select: { externalId: true },
  });
  const existingSet = new Set(existing.map((e) => e.externalId));

  let imported = 0;
  let updated = 0;

  for (const run of result.runs) {
    if (existingSet.has(run.externalId)) {
      updated++;
    } else {
      imported++;
    }
    await prisma.runLog.upsert({
      where: { userId_externalId: { userId: session.userId, externalId: run.externalId } },
      update: {
        date: run.date,
        distanceKm: run.distanceKm,
        durationMin: run.durationMin,
        title: run.name,
        elevationGainM: run.elevationGainM,
        calories: run.calories,
      },
      create: {
        userId: session.userId,
        date: run.date,
        distanceKm: run.distanceKm,
        durationMin: run.durationMin,
        source: "garmin_import",
        externalId: run.externalId,
        title: run.name,
        elevationGainM: run.elevationGainM,
        calories: run.calories,
      },
    });
  }

  return NextResponse.json({
    imported,
    updated,
    skippedNonRun: result.nonRunRows,
    skippedInvalid: result.invalidRows,
    totalRows: result.totalRows,
  });
}
