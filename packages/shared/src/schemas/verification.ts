import { z } from "zod";

export const CHECK_NAMES = [
  "schema_valid",
  "totals_reconcile",
  "date_range_sanity",
  "duplicate_within_document",
  "duplicate_across_documents",
  "completeness",
] as const;
export const checkNameSchema = z.enum(CHECK_NAMES);
export type CheckName = z.infer<typeof checkNameSchema>;

export const SEVERITIES = ["blocking", "warning"] as const;
export const severitySchema = z.enum(SEVERITIES);
export type Severity = z.infer<typeof severitySchema>;

/** Which check names are allowed to block promotion vs. only warn. */
export const CHECK_SEVERITY: Record<CheckName, Severity> = {
  schema_valid: "blocking",
  totals_reconcile: "blocking",
  completeness: "blocking",
  date_range_sanity: "warning",
  duplicate_within_document: "warning",
  duplicate_across_documents: "warning",
};
