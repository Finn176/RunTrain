import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getVerifiedUser } from "@/lib/session";

export async function GET() {
  const session = await getVerifiedUser();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { stravaRefreshToken: true, stravaLastSyncAt: true },
  });

  return NextResponse.json({
    connected: !!user?.stravaRefreshToken,
    lastSyncAt: user?.stravaLastSyncAt ?? null,
  });
}
