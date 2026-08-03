import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getVerifiedUser } from "@/lib/session";

// Forgets this user's stored Strava tokens. Doesn't touch any previously
// synced runs — they stay in your history exactly as imported, this just
// stops future syncing until you reconnect.
export async function POST() {
  const session = await getVerifiedUser();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: {
      stravaAthleteId: null,
      stravaAccessToken: null,
      stravaRefreshToken: null,
      stravaTokenExpiresAt: null,
      stravaLastSyncAt: null,
    },
  });

  return NextResponse.json({ ok: true });
}
