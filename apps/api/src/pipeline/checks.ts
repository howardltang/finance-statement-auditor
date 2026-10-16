import type { CheckName, Severity } from "@pfsa/shared";

export interface CheckResult {
  checkName: CheckName;
  passed: boolean;
  severity: Severity;
  details: Record<string, unknown>;
}

/** The minimal shape every check needs — matches an `extracted_transactions` row. */
export interface CandidateRow {
  id: string;
  date: string | null;
  merchant: string | null;
  amountCents: number;
  direction: "debit" | "credit";
}

const CENT_TOLERANCE = 1;

export function checkCompleteness(candidates: CandidateRow[]): CheckResult {
  return {
    checkName: "completeness",
    passed: candidates.length > 0,
    severity: "blocking",
    details: { count: candidates.length },
  };
}

/**
 * "Statement total" means different things on different documents (total
 * spend, total credits, net, an ending balance). Rather than guess which,
 * this passes if the declared total matches any of total debits, total
 * credits, or net — all defensible readings — within a 1-cent tolerance.
 * A document with no declared total has nothing to reconcile against, so
 * it passes trivially rather than being penalized for a check that
 * doesn't apply to it.
 */
export function checkTotalsReconcile(
  candidates: CandidateRow[],
  statementTotalCents: number | null,
): CheckResult {
  if (statementTotalCents == null) {
    return {
      checkName: "totals_reconcile",
      passed: true,
      severity: "blocking",
      details: { reason: "Document did not state its own total; nothing to reconcile against." },
    };
  }

  const debitCents = candidates
    .filter((c) => c.direction === "debit")
    .reduce((sum, c) => sum + c.amountCents, 0);
  const creditCents = candidates
    .filter((c) => c.direction === "credit")
    .reduce((sum, c) => sum + c.amountCents, 0);
  const netCents = Math.abs(debitCents - creditCents);

  const candidateTotals = { debitCents, creditCents, netCents };
  const matchedAs = (Object.keys(candidateTotals) as Array<keyof typeof candidateTotals>).find(
    (key) => Math.abs(candidateTotals[key] - statementTotalCents) <= CENT_TOLERANCE,
  );

  return {
    checkName: "totals_reconcile",
    passed: matchedAs !== undefined,
    severity: "blocking",
    details: { statementTotalCents, ...candidateTotals, matchedAs: matchedAs ?? null },
  };
}

export function checkDateRangeSanity(
  candidates: CandidateRow[],
  periodStart: string | null,
  periodEnd: string | null,
): CheckResult {
  if (!periodStart || !periodEnd) {
    return {
      checkName: "date_range_sanity",
      passed: true,
      severity: "warning",
      details: { reason: "No statement period to check dates against." },
    };
  }

  // ISO YYYY-MM-DD strings sort lexicographically the same as chronologically.
  const outOfRange = candidates.filter((c) => c.date && (c.date < periodStart || c.date > periodEnd));

  return {
    checkName: "date_range_sanity",
    passed: outOfRange.length === 0,
    severity: "warning",
    details: {
      periodStart,
      periodEnd,
      outOfRangeCount: outOfRange.length,
      examples: outOfRange.slice(0, 5).map((c) => ({ id: c.id, date: c.date })),
    },
  };
}

function duplicateKey(c: CandidateRow): string {
  return `${c.date ?? "null"}|${c.amountCents}|${normalizeMerchant(c.merchant)}`;
}

export function checkDuplicateWithinDocument(candidates: CandidateRow[]): CheckResult {
  const groups = new Map<string, CandidateRow[]>();
  for (const c of candidates) {
    const key = duplicateKey(c);
    const group = groups.get(key) ?? [];
    group.push(c);
    groups.set(key, group);
  }

  const duplicateGroups = [...groups.values()].filter((g) => g.length > 1);

  return {
    checkName: "duplicate_within_document",
    passed: duplicateGroups.length === 0,
    severity: "warning",
    details: {
      duplicateGroupCount: duplicateGroups.length,
      examples: duplicateGroups.slice(0, 5).map((g) => g.map((c) => c.id)),
    },
  };
}

export interface ExistingTransactionRef {
  id: string;
  date: string | null;
  amountCents: number;
  merchant: string | null;
}

export interface CrossDocumentMatch {
  extractedTransactionId: string;
  existingTransactionId: string;
  matchReason: string;
  confidence: number;
}

function normalizeMerchant(merchant: string | null): string {
  return (merchant ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function merchantsSimilar(a: string | null, b: string | null): boolean {
  const na = normalizeMerchant(a);
  const nb = normalizeMerchant(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / msPerDay;
}

const DUPLICATE_DATE_WINDOW_DAYS = 3;

/**
 * A receipt and a statement line can describe the same purchase. This never
 * drops either side automatically — it only flags the pair (as a warning)
 * for a human to resolve in the review UI, since which one is "right" (or
 * whether both are legitimately separate charges) isn't something a
 * deterministic rule can safely decide.
 */
export function findCrossDocumentDuplicates(
  candidates: CandidateRow[],
  existing: ExistingTransactionRef[],
): CrossDocumentMatch[] {
  const matches: CrossDocumentMatch[] = [];
  for (const c of candidates) {
    if (c.date == null) continue;
    for (const e of existing) {
      if (e.amountCents !== c.amountCents) continue;
      if (e.date == null || daysBetween(c.date, e.date) > DUPLICATE_DATE_WINDOW_DAYS) continue;
      if (!merchantsSimilar(c.merchant, e.merchant)) continue;

      matches.push({
        extractedTransactionId: c.id,
        existingTransactionId: e.id,
        matchReason: `same amount ($${(c.amountCents / 100).toFixed(2)}), date within ${DUPLICATE_DATE_WINDOW_DAYS} days, similar merchant name`,
        confidence: 0.8,
      });
    }
  }
  return matches;
}

export function checkDuplicateAcrossDocuments(
  candidates: CandidateRow[],
  existing: ExistingTransactionRef[],
): { result: CheckResult; matches: CrossDocumentMatch[] } {
  const matches = findCrossDocumentDuplicates(candidates, existing);
  return {
    result: {
      checkName: "duplicate_across_documents",
      passed: matches.length === 0,
      severity: "warning",
      details: { matchCount: matches.length, examples: matches.slice(0, 5) },
    },
    matches,
  };
}
