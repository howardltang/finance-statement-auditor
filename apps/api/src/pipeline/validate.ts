import { z } from "zod";
import { extractedTransactionSchema, type ExtractedTransaction } from "@pfsa/shared";

export interface ValidatedExtraction {
  transactions: ExtractedTransaction[];
  invalidCount: number;
  invalidSamples: Array<{ index: number; issues: string[] }>;
  statementTotalCents: number | null;
  periodStart: string | null;
  periodEnd: string | null;
}

const containerSchema = z
  .object({
    transactions: z.array(z.unknown()).default([]),
    statementTotalCents: z.number().int().nullable().default(null),
    periodStart: z.string().nullable().default(null),
    periodEnd: z.string().nullable().default(null),
  })
  .catch({ transactions: [], statementTotalCents: null, periodStart: null, periodEnd: null });

/**
 * The trust boundary. `raw` is whatever a model or file parser produced —
 * untyped, possibly malformed, possibly partial. This never throws: a
 * completely unusable payload degrades to zero transactions rather than
 * crashing the pipeline, and a payload that's mostly fine keeps every row
 * that validates while dropping (and reporting) only the rows that don't.
 * Nothing downstream of this function ever sees an unvalidated row.
 */
export function validateExtraction(raw: unknown): ValidatedExtraction {
  const container = containerSchema.parse(raw);

  const transactions: ExtractedTransaction[] = [];
  const invalidSamples: Array<{ index: number; issues: string[] }> = [];

  container.transactions.forEach((item, index) => {
    const result = extractedTransactionSchema.safeParse(item);
    if (result.success) {
      transactions.push(result.data);
    } else {
      invalidSamples.push({
        index,
        issues: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      });
    }
  });

  return {
    transactions,
    invalidCount: invalidSamples.length,
    invalidSamples: invalidSamples.slice(0, 10),
    statementTotalCents: container.statementTotalCents,
    periodStart: container.periodStart,
    periodEnd: container.periodEnd,
  };
}
