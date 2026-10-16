import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { documents, duplicateFlags, extractedTransactions, transactions } from "../db/schema.js";
import type { CrossDocumentMatch } from "./checks.js";

type DocumentRow = typeof documents.$inferSelect;

/**
 * Copies this document's staged rows into the trusted `transactions` table
 * — the only table the browsing/review UI reads for totals and filters.
 * Idempotent: any transactions already promoted from this document are
 * replaced, not duplicated, so re-verifying (e.g. after a manual retry)
 * is safe.
 */
export async function promoteDocument(
  document: DocumentRow,
  crossDocumentMatches: CrossDocumentMatch[],
): Promise<void> {
  await db.delete(transactions).where(eq(transactions.documentId, document.id));

  const candidates = await db
    .select()
    .from(extractedTransactions)
    .where(eq(extractedTransactions.documentId, document.id));
  if (candidates.length === 0) return;

  const inserted = await db
    .insert(transactions)
    .values(
      candidates.map((c) => ({
        userId: document.userId,
        documentId: document.id,
        extractedTransactionId: c.id,
        date: c.date,
        merchant: c.merchant,
        description: c.description,
        amountCents: c.amountCents,
        direction: c.direction,
        account: c.accountHint,
        category: c.category,
        categorySource: "llm" as const,
        isUncategorized: c.category === "uncategorized",
        needsDateReview: c.date === null,
      })),
    )
    .returning({ id: transactions.id, extractedTransactionId: transactions.extractedTransactionId });

  if (crossDocumentMatches.length === 0) return;

  const newIdByExtractedId = new Map(inserted.map((t) => [t.extractedTransactionId, t.id]));
  const flagRows = crossDocumentMatches
    .map((m) => {
      const transactionIdA = newIdByExtractedId.get(m.extractedTransactionId);
      if (!transactionIdA) return null;
      return {
        transactionIdA,
        transactionIdB: m.existingTransactionId,
        matchReason: m.matchReason,
        confidence: m.confidence,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (flagRows.length > 0) {
    await db.insert(duplicateFlags).values(flagRows);
  }
}
