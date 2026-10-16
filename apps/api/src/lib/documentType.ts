import type { DocumentType } from "@pfsa/shared";

const EXCEL_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

/** Returns null for anything we don't know how to ingest. */
export function detectDocumentType(mimeType: string, filename: string): DocumentType | null {
  const ext = filename.toLowerCase().split(".").pop() ?? "";

  if (mimeType === "application/pdf" || ext === "pdf") return "pdf_statement";
  if (mimeType.startsWith("image/")) return "image_receipt";
  if (mimeType === "text/csv" || ext === "csv") return "csv_export";
  if (EXCEL_MIME_TYPES.has(mimeType) || ext === "xlsx" || ext === "xls") return "xlsx_export";

  return null;
}
