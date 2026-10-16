import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { documents, extractedTransactions, verificationChecks } from "../db/schema.js";
import { storage } from "../lib/storage.js";
import { extractFromVisionDocument } from "./vision.js";
import { extractFromTabularDocument } from "./tabular.js";
import { validateExtraction } from "./validate.js";

type DocumentRow = typeof documents.$inferSelect;

/**
 * Runs the extract stage for one document: reads its bytes, calls the
 * appropriate extractor, validates every candidate row at the trust
 * boundary, and persists only what validated. Safe to re-run — staging
 * rows and the schema_valid check for this document are replaced, not
 * appended to, so retrying a failed job never duplicates data.
 */
export async function runExtractStage(document: DocumentRow): Promise<void> {
  const buffer = await storage.read(document.storageKey);

  const raw =
    document.documentType === "pdf_statement" || document.documentType === "image_receipt"
      ? await extractFromVisionDocument({
          buffer,
          mimeType: document.mimeType,
          documentType: document.documentType,
        })
      : await extractFromTabularDocument({ buffer, documentType: document.documentType });

  const validated = validateExtraction(raw);

  await db.delete(extractedTransactions).where(eq(extractedTransactions.documentId, document.id));

  if (validated.transactions.length > 0) {
    await db.insert(extractedTransactions).values(
      validated.transactions.map((t) => ({
        documentId: document.id,
        date: t.date,
        merchant: t.merchant,
        description: t.description,
        amountCents: t.amountCents,
        direction: t.direction,
        accountHint: t.accountHint,
        category: t.category,
        categoryConfidence: t.categoryConfidence,
      })),
    );
  }

  await db
    .delete(verificationChecks)
    .where(and(eq(verificationChecks.documentId, document.id), eq(verificationChecks.checkName, "schema_valid")));
  await db.insert(verificationChecks).values({
    documentId: document.id,
    checkName: "schema_valid",
    passed: validated.invalidCount === 0,
    severity: "blocking",
    details: {
      validCount: validated.transactions.length,
      invalidCount: validated.invalidCount,
      invalidSamples: validated.invalidSamples,
    },
  });

  await db
    .update(documents)
    .set({
      statementPeriodStart: validated.periodStart,
      statementPeriodEnd: validated.periodEnd,
      statementTotalCents: validated.statementTotalCents,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, document.id));
}
