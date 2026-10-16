import { z } from "zod";
import { CATEGORIES, categorySchema } from "@pfsa/shared";
import { anthropic, toolSchemaFrom, TEXT_MODEL } from "../lib/anthropic.js";

const TOOL_NAME = "record_categories";
const CHUNK_SIZE = 100;

const categorizationResultSchema = z.object({
  categories: z.array(
    z.object({
      index: z.number().int(),
      category: categorySchema,
      confidence: z.number().min(0).max(1),
    }),
  ),
});

export interface CategorizationCandidate {
  merchant: string | null;
  description: string | null;
}

export interface CategorizationResult {
  category: (typeof CATEGORIES)[number];
  confidence: number;
}

/** Categorizes deterministically-parsed rows (CSV/XLSX) where values are already trustworthy but category is a judgment call. */
export async function categorizeTransactions(
  candidates: CategorizationCandidate[],
): Promise<CategorizationResult[]> {
  const results: CategorizationResult[] = candidates.map(() => ({
    category: "uncategorized",
    confidence: 0,
  }));

  for (let start = 0; start < candidates.length; start += CHUNK_SIZE) {
    const chunk = candidates.slice(start, start + CHUNK_SIZE);
    const assignments = await categorizeChunk(chunk);
    for (const { index, category, confidence } of assignments) {
      const target = start + index;
      if (target >= 0 && target < results.length) {
        results[target] = { category, confidence };
      }
    }
  }

  return results;
}

async function categorizeChunk(chunk: CategorizationCandidate[]) {
  if (chunk.length === 0) return [];

  const listing = chunk
    .map((c, i) => `${i}: ${c.merchant ?? "(no merchant)"} — ${c.description ?? "(no description)"}`)
    .join("\n");

  const message = await anthropic.messages.create({
    model: TEXT_MODEL,
    max_tokens: 4096,
    tools: [
      {
        name: TOOL_NAME,
        description: "Record a spending category for each numbered transaction.",
        input_schema: toolSchemaFrom(categorizationResultSchema),
      },
    ],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [
      {
        role: "user",
        content: `Categorize each transaction below into one of: ${CATEGORIES.join(", ")}.
Use "uncategorized" with low confidence rather than forcing a guess you're not confident in.
Call ${TOOL_NAME} exactly once with one entry per index.

${listing}`,
      },
    ],
  });

  const toolUse = message.content.find((block) => block.type === "tool_use");
  const parsed = categorizationResultSchema.safeParse(toolUse?.input);
  return parsed.success ? parsed.data.categories : [];
}
