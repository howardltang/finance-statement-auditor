import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { transactions } from "../db/schema.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { aggregateSpendingByMonth, type MonthlySpendingRow } from "../pipeline/spending.js";
import { findOutliers } from "../pipeline/outliers.js";
import { askAboutSpending } from "../pipeline/ask.js";

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

analyticsRouter.get(
  "/spending-by-month",
  asyncHandler(async (req, res) => {
    const rows = await db
      .select({ date: transactions.date, category: transactions.category, amountCents: transactions.amountCents })
      .from(transactions)
      .where(and(eq(transactions.userId, req.user!.id), eq(transactions.direction, "debit")));

    const dated: MonthlySpendingRow[] = rows
      .filter((r) => r.date !== null)
      .map((r) => ({ date: r.date as string, category: r.category, amountCents: r.amountCents }));

    res.json({ series: aggregateSpendingByMonth(dated) });
  }),
);

analyticsRouter.get(
  "/outliers",
  asyncHandler(async (req, res) => {
    const rows = await db
      .select({
        id: transactions.id,
        date: transactions.date,
        merchant: transactions.merchant,
        category: transactions.category,
        amountCents: transactions.amountCents,
        direction: transactions.direction,
      })
      .from(transactions)
      .where(eq(transactions.userId, req.user!.id));

    res.json({ outliers: findOutliers(rows) });
  }),
);

const askSchema = z.object({ question: z.string().min(1).max(500) });

analyticsRouter.post(
  "/ask",
  asyncHandler(async (req, res) => {
    const parsed = askSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_input" });
      return;
    }
    const answer = await askAboutSpending(req.user!.id, parsed.data.question);
    res.json({ answer });
  }),
);
