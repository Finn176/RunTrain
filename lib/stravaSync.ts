// Shared Strava sync logic, used both by the manual "Sync now" button
// (app/api/strava/sync/route.ts) and by auto-sync-on-dashboard-load
// (app/dashboard/page.tsx). Keeping it in one place means both paths refresh
// tokens, page through activities, and dedupe against existing runs
// identically.

import { prisma } from "./db";
import {
  refreshStravaToken,
  fetchStravaActivities,
  StravaAuthError,
  type StravaSummaryActivity,
} from "./stravaClient";

export interface StravaSyncResult {
  connected: boolean;
  imported: number;
  updated: number;
  error: string | null;
  reauthRequired: boolean;
}

// First-time connect backfills just over a year of history — generous
// enough for a meaningful plan analysis without risking a huge number of
// API pages for someone with years of Strava data. Later syncs only ask for
// activities after the last sync, which is normally 0-1 pages.
const FIRST_SYNC_LOOKBACK_DAYS = 400;
const MAX_PAGES = 5; // 5 x 100 = up to 500 activities on a first sync
const PER_PAGE = 100;
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh a bit before actual expiry
export const AUTO_SYNC_THROTTLE_MINUTES = 30;

function isRunActivity(activity: StravaSummaryActivity): boolean {
  return /run/i.test(activity.sport_type ?? "");
}

// Whether auto-sync-on-page-load should fire, given when the user's Strava
// connection last synced. Throttled so ordinary navigation/refreshes don't
// repeatedly call Strava's API — both to stay well within Strava's rate
// limit and to keep page loads fast.
export function shouldAutoSync(lastSyncAt: Date | null): boolean {
  if (!lastSyncAt) return true;
  return Date.now() - lastSyncAt.getTime() > AUTO_SYNC_THROTTLE_MINUTES * 60 * 1000;
}

export async function syncStravaForUser(userId: string): Promise<StravaSyncResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      stravaAccessToken: true,
      stravaRefreshToken: true,
      stravaTokenExpiresAt: true,
      stravaLastSyncAt: true,
    },
  });

  if (!user?.stravaRefreshToken) {
    return { connected: false, imported: 0, updated: 0, error: null, reauthRequired: false };
  }

  let accessToken = user.stravaAccessToken ?? "";
  const needsRefresh =
    !user.stravaTokenExpiresAt || user.stravaTokenExpiresAt.getTime() < Date.now() + REFRESH_BUFFER_MS;

  if (needsRefresh) {
    try {
      const refreshed = await refreshStravaToken(user.stravaRefreshToken);
      accessToken = refreshed.accessToken;
      await prisma.user.update({
        where: { id: userId },
        data: {
          stravaAccessToken: refreshed.accessToken,
          stravaRefreshToken: refreshed.refreshToken,
          stravaTokenExpiresAt: refreshed.expiresAt,
        },
      });
    } catch {
      // Refresh tokens can be revoked from Strava's side (e.g. the user
      // disconnected the app from their Strava settings) — that surfaces
      // here as a failed refresh. Don't clear the stored tokens
      // automatically; let the user explicitly reconnect from the UI so
      // there's no confusing silent state change.
      return {
        connected: true,
        imported: 0,
        updated: 0,
        error: "Strava access needs to be reconnected.",
        reauthRequired: true,
      };
    }
  }

  const afterEpoch = user.stravaLastSyncAt
    ? Math.floor(user.stravaLastSyncAt.getTime() / 1000)
    : Math.floor((Date.now() - FIRST_SYNC_LOOKBACK_DAYS * 24 * 3600 * 1000) / 1000);

  const activities: StravaSummaryActivity[] = [];
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const batch = await fetchStravaActivities(accessToken, { after: afterEpoch, page, perPage: PER_PAGE });
      activities.push(...batch);
      if (batch.length < PER_PAGE) break; // reached the last page
    }
  } catch (err) {
    if (err instanceof StravaAuthError) {
      return {
        connected: true,
        imported: 0,
        updated: 0,
        error: "Strava access needs to be reconnected.",
        reauthRequired: true,
      };
    }
    return {
      connected: true,
      imported: 0,
      updated: 0,
      error: err instanceof Error ? err.message : "Strava sync failed.",
      reauthRequired: false,
    };
  }

  const runs = activities.filter(isRunActivity);

  const externalIds = runs.map((a) => String(a.id));
  const existing = await prisma.runLog.findMany({
    where: { userId, externalId: { in: externalIds } },
    select: { externalId: true },
  });
  const existingSet = new Set(existing.map((e) => e.externalId));

  let imported = 0;
  let updated = 0;

  for (const activity of runs) {
    if (!activity.distance || activity.distance <= 0 || !activity.moving_time || activity.moving_time <= 0) continue;
    const externalId = String(activity.id);
    const distanceKm = activity.distance / 1000;
    const durationMin = activity.moving_time / 60;

    if (existingSet.has(externalId)) updated++;
    else imported++;

    const routePolyline = activity.map?.summary_polyline || null;

    await prisma.runLog.upsert({
      where: { userId_externalId: { userId, externalId } },
      update: {
        date: new Date(activity.start_date),
        distanceKm,
        durationMin,
        title: activity.name,
        elevationGainM: activity.total_elevation_gain ?? null,
        routePolyline,
      },
      create: {
        userId,
        date: new Date(activity.start_date),
        distanceKm,
        durationMin,
        source: "strava_sync",
        externalId,
        title: activity.name,
        elevationGainM: activity.total_elevation_gain ?? null,
        routePolyline,
      },
    });
  }

  await prisma.user.update({ where: { id: userId }, data: { stravaLastSyncAt: new Date() } });

  return { connected: true, imported, updated, error: null, reauthRequired: false };
}
