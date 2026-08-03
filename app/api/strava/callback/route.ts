import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getVerifiedUser } from "@/lib/session";
import { exchangeStravaCode, STRAVA_OAUTH_STATE_COOKIE } from "@/lib/stravaClient";

// Strava redirects here after the user approves (or denies) access on its
// own consent screen.
export async function GET(req: NextRequest) {
  const session = await getVerifiedUser();
  if (!session) return NextResponse.redirect(new URL("/login", req.url));

  const params = req.nextUrl.searchParams;
  const error = params.get("error"); // e.g. "access_denied" if the user hit Cancel
  const code = params.get("code");
  const returnedState = params.get("state");
  const expectedState = req.cookies.get(STRAVA_OAUTH_STATE_COOKIE)?.value;

  const fail = (message: string) => {
    const res = NextResponse.redirect(new URL(`/import?stravaError=${encodeURIComponent(message)}`, req.url));
    res.cookies.delete(STRAVA_OAUTH_STATE_COOKIE);
    return res;
  };

  if (error) return fail(error === "access_denied" ? "Strava connection was cancelled." : error);
  if (!code) return fail("Strava didn't return an authorization code.");
  if (!expectedState || !returnedState || expectedState !== returnedState) {
    return fail("Strava connection request expired or didn't match — please try again.");
  }

  try {
    const tokens = await exchangeStravaCode(code);
    await prisma.user.update({
      where: { id: session.userId },
      data: {
        stravaAthleteId: tokens.athleteId ?? null,
        stravaAccessToken: tokens.accessToken,
        stravaRefreshToken: tokens.refreshToken,
        stravaTokenExpiresAt: tokens.expiresAt,
        // Leave stravaLastSyncAt untouched here — the very next page load
        // (or the "Sync now" button) performs the actual first sync, which
        // sets it. Keeping this route just about the OAuth handshake avoids
        // making a slow first-sync API call block the redirect back.
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't complete the Strava connection.";
    return fail(message);
  }

  const res = NextResponse.redirect(new URL("/import?stravaConnected=1", req.url));
  res.cookies.delete(STRAVA_OAUTH_STATE_COOKIE);
  return res;
}
