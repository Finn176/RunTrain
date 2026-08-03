import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

// IMPORTANT: set a real JWT_SECRET in your .env before sharing this app with
// friends. A fallback is provided so local dev doesn't crash out of the box.
//
// We use "jose" (not "jsonwebtoken") because middleware.ts runs on the Next.js
// Edge Runtime, which does not support Node's "crypto" module that
// jsonwebtoken depends on. jose uses the Web Crypto API instead, so the same
// verification logic works identically in middleware and in regular
// Node.js API routes / Server Components.
const SESSION_COOKIE = "runtrain_session";
const SESSION_DAYS = 30;

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET || "dev-secret-change-me-before-sharing";
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecretKey());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
export const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 24 * 60 * 60;
