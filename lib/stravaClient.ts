// Thin wrapper around Strava's OAuth + Activities API. Every self-hosted
// deployment needs its own Strava API application (see README) — that's a
// Strava requirement, not something this app can provision on your behalf.
// Read STRAVA_CLIENT_ID/STRAVA_CLIENT_SECRET lazily (not at module load) so
// a missing .env value produces a clear error at the moment it's needed
// rather than crashing the whole server on startup.

const STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_API_BASE = "https://www.strava.com/api/v3";

// Shared between the connect and callback routes (rather than exported from
// a route.ts file — Next.js's app router expects route files to only export
// HTTP method handlers and a small set of special config values).
export const STRAVA_OAUTH_STATE_COOKIE = "runtrain_strava_state";

// Read-only scope covering private activities too — this app never writes
// anything back to Strava.
const STRAVA_SCOPE = "read,activity:read_all";

function getClientId(): string {
  const id = process.env.STRAVA_CLIENT_ID;
  if (!id) throw new Error("STRAVA_CLIENT_ID is not set — see README for how to create a Strava API application.");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.STRAVA_CLIENT_SECRET;
  if (!secret) throw new Error("STRAVA_CLIENT_SECRET is not set — see README for how to create a Strava API application.");
  return secret;
}

// Base URL this app is reachable at (e.g. https://runtrain-yourname.onrender.com),
// used to build the OAuth redirect_uri, which must exactly match what's
// registered in your Strava API application settings. Falls back to the
// incoming request's own origin if APP_BASE_URL isn't set, which works for
// most single-domain deployments but is worth setting explicitly if you're
// ever behind a proxy that changes the host Next.js sees.
export function resolveAppBaseUrl(requestOrigin: string): string {
  return process.env.APP_BASE_URL?.replace(/\/$/, "") || requestOrigin;
}

export function buildStravaAuthorizeUrl(appBaseUrl: string, state: string): string {
  const redirectUri = `${appBaseUrl}/api/strava/callback`;
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: STRAVA_SCOPE,
    state,
  });
  return `${STRAVA_AUTHORIZE_URL}?${params.toString()}`;
}

export interface StravaTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date; // Strava returns a Unix seconds epoch
  athleteId?: string; // only present on the initial code exchange, not on refresh
}

export async function exchangeStravaCode(code: string): Promise<StravaTokenSet> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: getClientId(),
      client_secret: getClientSecret(),
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Strava token exchange failed (${res.status}): ${await res.text().catch(() => "")}`);
  }
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(data.expires_at * 1000),
    athleteId: data.athlete?.id != null ? String(data.athlete.id) : undefined,
  };
}

// Strava rotates the refresh token on every use — always persist the new one
// returned here, the old one stops working.
export async function refreshStravaToken(refreshToken: string): Promise<StravaTokenSet> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: getClientId(),
      client_secret: getClientSecret(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Strava token refresh failed (${res.status}): ${await res.text().catch(() => "")}`);
  }
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(data.expires_at * 1000),
  };
}

export interface StravaSummaryActivity {
  id: number;
  name: string;
  sport_type: string;
  start_date: string; // ISO
  distance: number; // meters
  moving_time: number; // seconds
  total_elevation_gain: number | null; // meters
  calories?: number | null;
  // Present on the summary activity list endpoint (no extra request needed)
  // whenever the activity has GPS data — an encoded Google-format polyline,
  // simplified/lower-resolution than the full-precision one only available
  // from the single-activity detail endpoint, but plenty for a route preview.
  map?: { summary_polyline?: string | null } | null;
}

// Fetches one page of the athlete's activities, newest first. `after` is a
// Unix-seconds epoch — pass the last sync time to only pull new activities.
export async function fetchStravaActivities(
  accessToken: string,
  opts: { after?: number; page?: number; perPage?: number }
): Promise<StravaSummaryActivity[]> {
  const params = new URLSearchParams();
  if (opts.after != null) params.set("after", String(opts.after));
  params.set("page", String(opts.page ?? 1));
  params.set("per_page", String(opts.perPage ?? 100));

  const res = await fetch(`${STRAVA_API_BASE}/athlete/activities?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) {
    throw new StravaAuthError("Strava access was revoked or expired.");
  }
  if (!res.ok) {
    throw new Error(`Strava activities request failed (${res.status}): ${await res.text().catch(() => "")}`);
  }
  return res.json();
}

// Distinguishes "the user's Strava connection needs to be re-authorized"
// from generic network/API errors, so callers can clear stored tokens
// specifically on this case rather than on any transient failure.
export class StravaAuthError extends Error {}
