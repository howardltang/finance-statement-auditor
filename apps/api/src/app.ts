import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./env.js";
import { authRouter } from "./routes/auth.js";
import { documentsRouter } from "./routes/documents.js";
import { transactionsRouter } from "./routes/transactions.js";
import { analyticsRouter } from "./routes/analytics.js";

export const app = express();

app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/transactions", transactionsRouter);
app.use("/api/analytics", analyticsRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "internal_error" });
});
