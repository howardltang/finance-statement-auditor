import { z } from "zod";

export const DOCUMENT_TYPES = [
  "pdf_statement",
  "image_receipt",
  "csv_export",
  "xlsx_export",
] as const;
export const documentTypeSchema = z.enum(DOCUMENT_TYPES);
export type DocumentType = z.infer<typeof documentTypeSchema>;

/**
 * Discriminated by `status` so a document can never carry fields that only
 * make sense in another state (e.g. no `error` on an `accepted` doc).
 */
export const DOCUMENT_STATUSES = [
  "uploaded",
  "processing",
  "needs_review",
  "accepted",
  "rejected",
  "failed",
] as const;
export const documentStatusSchema = z.enum(DOCUMENT_STATUSES);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export const PROCESSING_STAGES = ["extract", "verify", "promote"] as const;
export const processingStageSchema = z.enum(PROCESSING_STAGES);
export type ProcessingStage = z.infer<typeof processingStageSchema>;
