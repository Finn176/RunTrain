import { NextResponse } from "next/server";
import { getVerifiedUser } from "@/lib/session";
import { syncStravaForUser } from "@/lib/stravaSync";

// Manual "Sync now" trigger — same logic auto-sync-on-dashboard-load uses,
// just invoked on demand (e.g. right after finishing a run) instead of
// waiting for the next page visit's throttle window to pass.
export async function POST() {
  const session = await getVerifiedUser();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const result = await syncStravaForUser(session.userId);
  if (!result.connected) {
    return NextResponse.json({ error: "Strava isn't connected." }, { status: 400 });
  }
  return NextResponse.json(result);
}
