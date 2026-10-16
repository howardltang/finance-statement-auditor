import Papa from "papaparse";
import * as XLSX from "xlsx";
import { z } from "zod";
import type { DocumentType } from "@pfsa/shared";
import { anthropic, toolSchemaFrom, TEXT_MODEL } from "../lib/anthropic.js";
import { categorizeTransactions } from "./categorize.js";

interface TabularInput {
  buffer: Buffer;
  documentType: Extract<DocumentType, "csv_export" | "xlsx_export">;
}

interface ColumnMapping {
  date: string;
  description: string | null;
  amount: string | null;
  debit: string | null;
  credit: string | null;
}

interface RawCandidate {
  date: string | null;
  merchant: string | null;
  amountCents: number | null;
  direction: "debit" | "credit" | null;
}

function parseRows(buffer: Buffer, documentType: TabularInput["documentType"]): Record<string, unknown>[] {
  if (documentType === "csv_export") {
    const result = Papa.parse<Record<string, unknown>>(buffer.toString("utf-8"), {
      header: true,
      skipEmptyLines: true,
    });
    return result.data;
  }
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
}

/** Deterministic header matching for common bank/card export layouts. Debit/credit columns take priority over a generic "amount" column when both exist, to avoid misreading a split-column export as a single signed one. */
function heuristicMapping(headers: string[]): ColumnMapping | null {
  const find = (pattern: RegExp) => headers.find((h) => pattern.test(h)) ?? null;

  const date = find(/date/i);
  const description = find(/desc|merchant|payee|name/i);
  const debit = find(/debit/i);
  const credit = find(/credit/i);
  const amount = debit || credit ? null : find(/amount/i);

  if (!date) return null;
  if (!amount && !debit && !credit) return null;

  return { date, description, amount, debit, credit };
}

const llmMappingSchema = z.object({
  date: z.string().nullable(),
  description: z.string().nullable(),
  amount: z.string().nullable(),
  debit: z.string().nullable(),
  credit: z.string().nullable(),
});

/** Only reached when header names don't match common conventions — the model picks which header is which, but never touches the actual cell values. */
async function llmMapping(
  headers: string[],
  sampleRows: Record<string, unknown>[],
): Promise<ColumnMapping | null> {
  const sample = sampleRows
    .slice(0, 5)
    .map((r) => JSON.stringify(r))
    .join("\n");

  const message = await anthropic.messages.create({
    model: TEXT_MODEL,
    max_tokens: 1024,
    tools: [
      {
        name: "map_columns",
        description: "Map this CSV/XLSX's columns to transaction fields.",
        input_schema: toolSchemaFrom(llmMappingSchema),
      },
    ],
    tool_choice: { type: "tool", name: "map_columns" },
    messages: [
      {
        role: "user",
        content: `Column headers from a bank/card export: ${headers.join(", ")}
Sample rows:
${sample}

Map date, description, amount (a single signed/unsigned column, if present), debit (debit-only column, if present), and credit (credit-only column, if present) to one of the headers above, or null if there's no match. A date column is required.`,
      },
    ],
  });

  const toolUse = message.content.find((b) => b.type === "tool_use");
  const parsed = llmMappingSchema.safeParse(toolUse?.input);
  if (!parsed.success) return null;
  const { date, description, amount, debit, credit } = parsed.data;
  if (!date) return null;
  return { date, description, amount, debit, credit };
}

function normalizeDate(raw: unknown): string | null {
  if (raw == null) return null;
  const str = String(raw).trim();
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function parseAmountCents(raw: unknown): number | null {
  if (raw == null) return null;
  const str = String(raw).replace(/[$,\s]/g, "");
  if (!str) return null;
  const value = Number.parseFloat(str);
  if (Number.isNaN(value)) return null;
  return Math.round(Math.abs(value) * 100);
}

function buildCandidate(row: Record<string, unknown>, mapping: ColumnMapping): RawCandidate {
  const date = normalizeDate(row[mapping.date]);
  const merchant = mapping.description && row[mapping.description] != null ? String(row[mapping.description]) : null;

  const debitRaw = mapping.debit ? row[mapping.debit] : null;
  const creditRaw = mapping.credit ? row[mapping.credit] : null;

  if (debitRaw != null && String(debitRaw).trim() !== "") {
    return { date, merchant, amountCents: parseAmountCents(debitRaw), direction: "debit" };
  }
  if (creditRaw != null && String(creditRaw).trim() !== "") {
    return { date, merchant, amountCents: parseAmountCents(creditRaw), direction: "credit" };
  }
  if (mapping.amount) {
    const raw = row[mapping.amount];
    // Sign convention assumption: negative = money out (debit), positive = money in (credit).
    // This matches most bank CSV exports but isn't universal; a document where it's
    // inverted will show up as every transaction on the wrong side of the ledger,
    // which totals_reconcile (Phase 5) should catch as a mismatch worth reviewing.
    const isNegative = raw != null && String(raw).trim().startsWith("-");
    return { date, merchant, amountCents: parseAmountCents(raw), direction: isNegative ? "debit" : "credit" };
  }
  return { date, merchant, amountCents: null, direction: null };
}

export async function extractFromTabularDocument({ buffer, documentType }: TabularInput) {
  const rows = parseRows(buffer, documentType);
  const empty = { transactions: [], statementTotalCents: null, periodStart: null, periodEnd: null };
  if (rows.length === 0) return empty;

  const headers = Object.keys(rows[0] ?? {});
  const mapping = heuristicMapping(headers) ?? (await llmMapping(headers, rows));
  if (!mapping) return empty;

  const candidates = rows
    .map((row) => buildCandidate(row, mapping))
    .filter((c): c is RawCandidate & { amountCents: number; direction: "debit" | "credit" } => c.amountCents != null && c.direction != null);

  const categorizations = await categorizeTransactions(
    candidates.map((c) => ({ merchant: c.merchant, description: c.merchant })),
  );

  const transactions = candidates.map((c, i) => ({
    date: c.date,
    merchant: c.merchant,
    description: c.merchant,
    amountCents: c.amountCents,
    direction: c.direction,
    accountHint: null,
    category: categorizations[i]?.category ?? "uncategorized",
    categoryConfidence: categorizations[i]?.confidence ?? 0,
  }));

  return { transactions, statementTotalCents: null, periodStart: null, periodEnd: null };
}
