import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "../db/client.js";
import { documents, extractedTransactions, transactions, verificationChecks } from "../db/schema.js";
import {
  checkCompleteness,
  checkDateRangeSanity,
  checkDuplicateAcrossDocuments,
  checkDuplicateWithinDocument,
  checkTotalsReconcile,
  type CheckResult,
} from "./checks.js";
import { promoteDocument } from "./promote.js";

type DocumentRow = typeof documents.$inferSelect;

/**
 * Runs every deterministic check, records each result, and decides
 * accept-vs-needs_review from them: any failed *blocking* check parks the
 * document for a human; warnings never block (they're surfaced, not
 * enforced) so e.g. a likely duplicate never silently blocks an otherwise
 * clean statement from showing up.
 */
export async function runVerifyStage(document: DocumentRow): Promise<void> {
  const candidates = await db
    .select()
    .from(extractedTransactions)
    .where(eq(extractedTransactions.documentId, document.id));

  // Excludes this document's own previously-promoted rows: reprocessing an
  // already-accepted document (e.g. after a stale-job reap) must never
  // match a candidate against its own prior self, which promoteDocument is
  // about to delete anyway.
  const existing = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amountCents: transactions.amountCents,
      merchant: transactions.merchant,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, document.userId), ne(transactions.documentId, document.id)));

  const completeness = checkCompleteness(candidates);
  const totals = checkTotalsReconcile(candidates, document.statementTotalCents);
  const dateRange = checkDateRangeSanity(candidates, document.statementPeriodStart, document.statementPeriodEnd);
  const dupWithin = checkDuplicateWithinDocument(candidates);
  const { result: dupAcross, matches: crossDocumentMatches } = checkDuplicateAcrossDocuments(
    candidates,
    existing,
  );

  const results: CheckResult[] = [completeness, totals, dateRange, dupWithin, dupAcross];

  await db
    .delete(verificationChecks)
    .where(
      and(
        eq(verificationChecks.documentId, document.id),
        inArray(
          verificationChecks.checkName,
          results.map((r) => r.checkName),
        ),
      ),
    );
  await db.insert(verificationChecks).values(
    results.map((r) => ({
      documentId: document.id,
      checkName: r.checkName,
      passed: r.passed,
      severity: r.severity,
      details: r.details,
    })),
  );

  const [schemaValid] = await db
    .select({ passed: verificationChecks.passed, severity: verificationChecks.severity })
    .from(verificationChecks)
    .where(and(eq(verificationChecks.documentId, document.id), eq(verificationChecks.checkName, "schema_valid")));

  const allChecks = schemaValid ? [...results, schemaValid] : results;
  const allBlockingPassed = allChecks.every((r) => r.severity !== "blocking" || r.passed);

  if (allBlockingPassed) {
    await promoteDocument(document, crossDocumentMatches);
    await db
      .update(documents)
      .set({ status: "accepted", statusDetail: null, updatedAt: new Date() })
      .where(eq(documents.id, document.id));
  } else {
    const failedBlocking = allChecks.filter((r) => r.severity === "blocking" && !r.passed);
    await db
      .update(documents)
      .set({
        status: "needs_review",
        statusDetail: {
          note: `Failed ${failedBlocking.length} check${failedBlocking.length === 1 ? "" : "s"}. Review and correct or accept manually.`,
        },
        updatedAt: new Date(),
      })
      .where(eq(documents.id, document.id));
  }
}
