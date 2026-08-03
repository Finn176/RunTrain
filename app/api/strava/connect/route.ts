import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getVerifiedUser } from "@/lib/session";
import { buildStravaAuthorizeUrl, resolveAppBaseUrl, STRAVA_OAUTH_STATE_COOKIE } from "@/lib/stravaClient";

// Kicks off the OAuth handshake: sends the browser to Strava's authorize
// page. A random "state" value is stashed in a short-lived httpOnly cookie
// and echoed back by Strava on the callback, so we can confirm the callback
// really followed from a connect attempt we initiated (basic CSRF defense)
// rather than acting on an arbitrary incoming ?code= from somewhere else.
export async function GET(req: NextRequest) {
  const session = await getVerifiedUser();
  if (!session) return NextResponse.redirect(new URL("/login", req.url));

  try {
    const appBaseUrl = resolveAppBaseUrl(req.nextUrl.origin);
    const state = randomBytes(16).toString("hex");
    const authorizeUrl = buildStravaAuthorizeUrl(appBaseUrl, state);

    const res = NextResponse.redirect(authorizeUrl);
    res.cookies.set(STRAVA_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600, // 10 minutes is plenty to complete the Strava consent screen
      path: "/",
    });
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Strava isn't configured on this deployment yet.";
    return NextResponse.redirect(new URL(`/import?stravaError=${encodeURIComponent(message)}`, req.url));
  }
}
