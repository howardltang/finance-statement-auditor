import { z } from "zod";
import { categorySchema } from "../categories.js";

export const DIRECTIONS = ["debit", "credit"] as const;
export const directionSchema = z.enum(DIRECTIONS);
export type Direction = z.infer<typeof directionSchema>;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

/**
 * The trust boundary schema. This is the ONLY shape allowed to cross from
 * "something a model or parser produced" into `extracted_transactions`.
 * A row that fails this validation is dropped and logged, never persisted.
 *
 * `date` and `merchant` are nullable on purpose: a blurry receipt or a
 * cropped statement line genuinely may not carry one. Forcing a fallback
 * value here would hide that uncertainty from the verification layer and
 * the review UI, so callers must handle null explicitly downstream.
 */
export const extractedTransactionSchema = z.object({
  date: isoDate.nullable(),
  merchant: z.string().min(1).nullable(),
  description: z.string().nullable(),
  amountCents: z.number().int(),
  direction: directionSchema,
  accountHint: z.string().nullable(),
  category: categorySchema,
  categoryConfidence: z.number().min(0).max(1),
});
export type ExtractedTransaction = z.infer<typeof extractedTransactionSchema>;

/**
 * The full shape requested from the model (or produced by deterministic
 * CSV/XLSX parsing) for one document. `statementTotalCents` and the period
 * bounds are nullable because not every document type states them
 * (a single receipt has no "period"), and their absence is itself
 * information the verification layer uses (it can't reconcile totals it
 * was never given).
 */
export const extractionResultSchema = z.object({
  transactions: z.array(extractedTransactionSchema),
  statementTotalCents: z.number().int().nullable(),
  periodStart: isoDate.nullable(),
  periodEnd: isoDate.nullable(),
});
export type ExtractionResult = z.infer<typeof extractionResultSchema>;
