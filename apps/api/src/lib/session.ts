import { randomBytes } from "node:crypto";
import type { Response } from "express";
import { db } from "../db/client.js";
import { sessions } from "../db/schema.js";
import { env } from "../env.js";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function createSession(userId: string) {
  const id = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id, userId, expiresAt });
  return { id, expiresAt };
}

export function setSessionCookie(res: Response, sessionId: string, expiresAt: Date) {
  res.cookie(env.SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(env.SESSION_COOKIE_NAME, { path: "/" });
}
