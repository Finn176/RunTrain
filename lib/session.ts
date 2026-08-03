import { cookies } from "next/headers";
import { prisma } from "./db";
import { SESSION_COOKIE_NAME, SessionPayload, verifySession } from "./auth";
import type { UnitPreference } from "./units";

// Server Component / Route Handler helper: read the current session (if any)
// from the request cookies. Note: this only verifies the login token itself
// (signature + expiry) — it does NOT confirm the user still exists in the
// database. That's fine for display purposes, but any code that's about to
// write a row referencing this user (e.g. creating a plan or run) should use
// getVerifiedUser() below instead, so a stale/orphaned session (e.g. after
// switching between two copies of this project with different database
// files) fails with a clear message rather than a raw foreign-key error.
export async function getCurrentSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

// Like getCurrentSession, but also confirms the user still exists in the
// current database. Returns null if there's no session OR if the session
// refers to a user that isn't in this database (a stale/orphaned session).
export async function getVerifiedUser(): Promise<SessionPayload | null> {
  const session = await getCurrentSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return null;
  return session;
}

export interface UserPrefs {
  userId: string;
  name: string;
  email: string;
  unitPreference: UnitPreference;
  dateOfBirth: Date | null;
  sex: string | null;
}

// Preferences (unit, date of birth, sex) live only in the database, not in
// the signed session cookie — the cookie isn't re-signed when a user saves
// a preference change, so encoding them there would go stale until the next
// login. This does one small fresh lookup instead. Returns null if there's
// no session or the session's user no longer exists.
export async function getCurrentUserPrefs(): Promise<UserPrefs | null> {
  const session = await getCurrentSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, unitPreference: true, dateOfBirth: true, sex: true },
  });
  if (!user) return null;
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    unitPreference: user.unitPreference === "mi" ? "mi" : "km",
    dateOfBirth: user.dateOfBirth,
    sex: user.sex,
  };
}

// Convenience for the common case: pages that only need the display unit,
// not the full preferences object. Defaults to "km" if not logged in (pages
// that reach this point should already have redirected to /login, so this
// is just a safe fallback, never the normal path).
export async function getCurrentUnit(): Promise<UnitPreference> {
  const prefs = await getCurrentUserPrefs();
  return prefs?.unitPreference ?? "km";
}
