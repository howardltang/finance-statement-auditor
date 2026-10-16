import { Router } from "express";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { categorySchema } from "@pfsa/shared";
import { db } from "../db/client.js";
import { transactions } from "../db/schema.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../lib/asyncHandler.js";

export const transactionsRouter = Router();
transactionsRouter.use(requireAuth);

const listQuerySchema = z.object({
  category: categorySchema.optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  undated: z.enum(["true"]).optional(),
});

transactionsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_query", details: parsed.error.flatten() });
      return;
    }
    const { category, dateFrom, dateTo, undated } = parsed.data;

    const conditions = [eq(transactions.userId, req.user!.id)];
    if (category) conditions.push(eq(transactions.category, category));
    if (undated === "true") {
      conditions.push(sql`${transactions.date} IS NULL`);
    } else {
      if (dateFrom) conditions.push(gte(transactions.date, dateFrom));
      if (dateTo) conditions.push(lte(transactions.date, dateTo));
    }

    const rows = await db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(desc(transactions.date), asc(transactions.merchant));

    const totals = rows.reduce(
      (acc, t) => {
        if (t.direction === "debit") acc.debitCents += t.amountCents;
        else acc.creditCents += t.amountCents;
        return acc;
      },
      { debitCents: 0, creditCents: 0 },
    );

    res.json({
      transactions: rows,
      totals: { ...totals, netCents: totals.creditCents - totals.debitCents, count: rows.length },
    });
  }),
);

const patchSchema = z.object({
  category: categorySchema,
});

transactionsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
      return;
    }

    const [existing] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.id, req.params.id!), eq(transactions.userId, req.user!.id)));
    if (!existing) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const [updated] = await db
      .update(transactions)
      .set({
        category: parsed.data.category,
        categorySource: "user",
        isUncategorized: parsed.data.category === "uncategorized",
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, req.params.id!))
      .returning();

    res.json({ transaction: updated });
  }),
);
