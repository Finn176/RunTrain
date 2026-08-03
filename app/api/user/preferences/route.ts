import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";

const schema = z.object({
  unitPreference: z.enum(["km", "mi"]),
  dateOfBirth: z.string().nullable().optional(), // ISO date string, or null to clear
  sex: z.enum(["male", "female", "other", "prefer_not_to_say"]).nullable().optional(),
});

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { unitPreference: true, dateOfBirth: true, sex: true },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ preferences: user });
}

export async function PATCH(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const input = parsed.data;

  let dateOfBirth: Date | null | undefined = undefined;
  if (input.dateOfBirth !== undefined) {
    if (input.dateOfBirth === null || input.dateOfBirth === "") {
      dateOfBirth = null;
    } else {
      const parsedDate = new Date(input.dateOfBirth);
      if (isNaN(parsedDate.getTime())) {
        return NextResponse.json({ error: "Invalid date of birth" }, { status: 400 });
      }
      dateOfBirth = parsedDate;
    }
  }

  const user = await prisma.user.update({
    where: { id: session.userId },
    data: {
      unitPreference: input.unitPreference,
      ...(dateOfBirth !== undefined ? { dateOfBirth } : {}),
      ...(input.sex !== undefined ? { sex: input.sex } : {}),
    },
    select: { unitPreference: true, dateOfBirth: true, sex: true },
  });

  return NextResponse.json({ preferences: user });
}
