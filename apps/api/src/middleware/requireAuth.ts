import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { sessions, users } from "../db/schema.js";
import { env } from "../env.js";

export interface AuthedUser {
  id: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.cookies?.[env.SESSION_COOKIE_NAME];
  if (!sessionId || typeof sessionId !== "string") {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }

  const [row] = await db
    .select({ userId: users.id, email: users.email, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!row || row.expiresAt.getTime() < Date.now()) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }

  req.user = { id: row.userId, email: row.email };
  next();
}
