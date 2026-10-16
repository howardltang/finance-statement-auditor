import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { users, sessions } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { createSession, setSessionCookie, clearSessionCookie } from "../lib/session.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { env } from "../env.js";

export const authRouter = Router();

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
      return;
    }
    const { email, password } = parsed.data;

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (existing) {
      res.status(409).json({ error: "email_taken" });
      return;
    }

    const passwordHash = await hashPassword(password);
    const [user] = await db.insert(users).values({ email, passwordHash }).returning({
      id: users.id,
      email: users.email,
    });
    if (!user) {
      res.status(500).json({ error: "registration_failed" });
      return;
    }

    const session = await createSession(user.id);
    setSessionCookie(res, session.id, session.expiresAt);
    res.status(201).json({ user });
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
      return;
    }
    const { email, password } = parsed.data;

    const [user] = await db
      .select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, email));

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }

    const session = await createSession(user.id);
    setSessionCookie(res, session.id, session.expiresAt);
    res.json({ user: { id: user.id, email: user.email } });
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const sessionId = req.cookies?.[env.SESSION_COOKIE_NAME];
    if (sessionId && typeof sessionId === "string") {
      await db.delete(sessions).where(eq(sessions.id, sessionId));
    }
    clearSessionCookie(res);
    res.status(204).send();
  }),
);

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
