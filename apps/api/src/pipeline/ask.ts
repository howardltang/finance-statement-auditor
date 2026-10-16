import { and, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { categorySchema } from "@pfsa/shared";
import { db } from "../db/client.js";
import { transactions } from "../db/schema.js";
import { anthropic, toolSchemaFrom, VISION_MODEL } from "../lib/anthropic.js";

const MAX_TOOL_ROUNDS = 4;

const dateRangeSchema = z.object({
  dateFrom: z.string().nullable(),
  dateTo: z.string().nullable(),
});

const listTransactionsSchema = dateRangeSchema.extend({
  category: categorySchema.nullable(),
  minAmountCents: z.number().int().nullable(),
});

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_category_totals",
    description: "Get total spending and income by category for a date range (inclusive, YYYY-MM-DD).",
    input_schema: toolSchemaFrom(dateRangeSchema),
  },
  {
    name: "list_transactions",
    description:
      "List individual transactions matching filters, most recent first, capped at 50. Use this to look at specific transactions, not for totals.",
    input_schema: toolSchemaFrom(listTransactionsSchema),
  },
];

async function getCategoryTotals(userId: string, input: z.infer<typeof dateRangeSchema>) {
  const conditions = [eq(transactions.userId, userId)];
  if (input.dateFrom) conditions.push(gte(transactions.date, input.dateFrom));
  if (input.dateTo) conditions.push(lte(transactions.date, input.dateTo));

  const rows = await db
    .select({
      category: transactions.category,
      direction: transactions.direction,
      amountCents: transactions.amountCents,
    })
    .from(transactions)
    .where(and(...conditions));

  const totals = new Map<string, { debitCents: number; creditCents: number }>();
  for (const row of rows) {
    const entry = totals.get(row.category) ?? { debitCents: 0, creditCents: 0 };
    if (row.direction === "debit") entry.debitCents += row.amountCents;
    else entry.creditCents += row.amountCents;
    totals.set(row.category, entry);
  }
  return Object.fromEntries(totals);
}

async function listTransactionsTool(userId: string, input: z.infer<typeof listTransactionsSchema>) {
  const conditions = [eq(transactions.userId, userId)];
  if (input.dateFrom) conditions.push(gte(transactions.date, input.dateFrom));
  if (input.dateTo) conditions.push(lte(transactions.date, input.dateTo));
  if (input.category) conditions.push(eq(transactions.category, input.category));
  if (input.minAmountCents != null) conditions.push(gte(transactions.amountCents, input.minAmountCents));

  const rows = await db
    .select({
      date: transactions.date,
      merchant: transactions.merchant,
      category: transactions.category,
      amountCents: transactions.amountCents,
      direction: transactions.direction,
    })
    .from(transactions)
    .where(and(...conditions))
    .orderBy(desc(transactions.date))
    .limit(50);

  return rows;
}

async function runTool(userId: string, name: string, input: unknown): Promise<unknown> {
  if (name === "get_category_totals") {
    const parsed = dateRangeSchema.safeParse(input);
    if (!parsed.success) return { error: "invalid input" };
    return getCategoryTotals(userId, parsed.data);
  }
  if (name === "list_transactions") {
    const parsed = listTransactionsSchema.safeParse(input);
    if (!parsed.success) return { error: "invalid input" };
    return listTransactionsTool(userId, parsed.data);
  }
  return { error: `unknown tool ${name}` };
}

/**
 * A bounded tool-use loop grounded entirely in the trusted `transactions`
 * table — it never touches staging or raw documents, so every number it
 * can cite has already passed verification. Amounts move in cents through
 * the tools; the model converts to dollars for the reader.
 */
export async function askAboutSpending(userId: string, question: string): Promise<string> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];
  const system = `You answer questions about the user's personal finances using ONLY the provided tools — never invent numbers. Today's date is ${new Date().toISOString().slice(0, 10)}. Tool amounts are in cents; convert to dollars in your answer. If a query returns no data, say so plainly rather than guessing.`;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const message = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 1024,
      system,
      tools: TOOLS,
      messages,
    });

    const toolUses = message.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (toolUses.length === 0) {
      const text = message.content.find((block): block is Anthropic.TextBlock => block.type === "text");
      return text?.text ?? "I couldn't come up with an answer to that.";
    }

    messages.push({ role: "assistant", content: message.content });
    const toolResults = await Promise.all(
      toolUses.map(async (toolUse) => ({
        type: "tool_result" as const,
        tool_use_id: toolUse.id,
        content: JSON.stringify(await runTool(userId, toolUse.name, toolUse.input)),
      })),
    );
    messages.push({ role: "user", content: toolResults });
  }

  return "I wasn't able to finish answering that within my step budget — try a narrower question.";
}
