import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";

const PROTECTED_PREFIXES = ["/dashboard", "/plan", "/progress", "/import", "/activities", "/settings", "/log"];
const AUTH_PAGES = ["/login", "/signup"];

// Exact-segment prefix match — NOT a raw pathname.startsWith(p) check. That
// naive version has a real bug: "/login".startsWith("/log") is true in
// JavaScript, so "/log" (added for the Training Log page) was silently also
// matching "/login" as a protected route. Logged-out users hitting /login
// then got redirected to /login itself, forever — an infinite loop that
// only ever showed up when actually logged out, since a valid session took
// a different branch below and masked it. This match requires the next
// character after the prefix to be "/" (or nothing), so "/log" only ever
// matches "/log" and "/log/...", never "/login".
function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  const isProtected = matchesPrefix(pathname, PROTECTED_PREFIXES);
  const isAuthPage = matchesPrefix(pathname, AUTH_PAGES);

  if (isProtected && !session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthPage && session) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/plan/:path*",
    "/progress/:path*",
    "/import/:path*",
    "/activities/:path*",
    "/settings/:path*",
    "/log/:path*",
    "/login",
    "/signup",
  ],
};
