import { createHash } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { categorySchema, directionSchema } from "@pfsa/shared";
import { db } from "../db/client.js";
import { documents, extractedTransactions, jobs, transactions, verificationChecks } from "../db/schema.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { detectDocumentType } from "../lib/documentType.js";
import { storage } from "../lib/storage.js";
import { enqueueJob } from "../lib/queue.js";
import { createPresignedUploadUrl } from "../lib/s3.js";
import { env } from "../env.js";
import { checkDuplicateAcrossDocuments, type CandidateRow, type ExistingTransactionRef } from "../pipeline/checks.js";
import { promoteDocument } from "../pipeline/promote.js";
import { runVerifyStage } from "../pipeline/verify.js";

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const POSTGRES_UNIQUE_VIOLATION = "23505";

documentsRouter.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const file = req.file;
    const userId = req.user!.id;

    if (!file) {
      res.status(400).json({ error: "file_required" });
      return;
    }

    const documentType = detectDocumentType(file.mimetype, file.originalname);
    if (!documentType) {
      res.status(400).json({ error: "unsupported_file_type" });
      return;
    }

    const fileHash = createHash("sha256").update(file.buffer).digest("hex");

    const [existing] = await db
      .select({ id: documents.id, status: documents.status })
      .from(documents)
      .where(and(eq(documents.userId, userId), eq(documents.fileHash, fileHash)));
    if (existing) {
      res.status(409).json({ error: "duplicate_upload", document: existing });
      return;
    }

    const storageKey = `${userId}/${fileHash}-${file.originalname}`;

    try {
      const [document] = await db
        .insert(documents)
        .values({
          userId,
          filename: file.originalname,
          mimeType: file.mimetype,
          fileHash,
          storageKey,
          documentType,
          status: "uploaded",
        })
        .returning();
      if (!document) {
        res.status(500).json({ error: "upload_failed" });
        return;
      }

      // Persist bytes only after the row is committed to the trust boundary
      // (documents table); an orphaned file on disk with no DB row is
      // harmless, but a DB row pointing at bytes that were never written
      // would break the worker.
      await storage.save(storageKey, file.buffer);

      const [job] = await db.insert(jobs).values({ documentId: document.id }).returning({ id: jobs.id });
      if (job) await enqueueJob(job.id);

      res.status(201).json({ document });
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "duplicate_upload" });
        return;
      }
      throw err;
    }
  }),
);

const presignSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  fileHash: z.string().regex(/^[0-9a-f]{64}$/, "expected a hex sha256 hash"),
});

/**
 * S3-mode only. Hashing client-side before requesting a URL lets a true
 * duplicate get rejected before any bytes move — an improvement on the
 * local flow, which can only dedupe after receiving the full upload.
 */
documentsRouter.post(
  "/presign",
  asyncHandler(async (req, res) => {
    if (env.STORAGE_DRIVER !== "s3" || !env.UPLOADS_BUCKET) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const parsed = presignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
      return;
    }
    const { filename, mimeType, fileHash } = parsed.data;
    const userId = req.user!.id;

    const documentType = detectDocumentType(mimeType, filename);
    if (!documentType) {
      res.status(400).json({ error: "unsupported_file_type" });
      return;
    }

    const [existing] = await db
      .select({ id: documents.id, status: documents.status })
      .from(documents)
      .where(and(eq(documents.userId, userId), eq(documents.fileHash, fileHash)));
    if (existing) {
      res.status(409).json({ error: "duplicate_upload", document: existing });
      return;
    }

    const storageKey = `${userId}/${fileHash}-${filename}`;
    const uploadUrl = await createPresignedUploadUrl(env.UPLOADS_BUCKET, storageKey, mimeType);
    res.json({ uploadUrl, storageKey });
  }),
);

const confirmSchema = z.object({
  storageKey: z.string().min(1),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  fileHash: z.string().regex(/^[0-9a-f]{64}$/),
});

/** S3-mode only. Called once the browser's presigned PUT to S3 has completed. */
documentsRouter.post(
  "/confirm",
  asyncHandler(async (req, res) => {
    if (env.STORAGE_DRIVER !== "s3") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const parsed = confirmSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
      return;
    }
    const { storageKey, filename, mimeType, fileHash } = parsed.data;
    const userId = req.user!.id;

    const documentType = detectDocumentType(mimeType, filename);
    if (!documentType) {
      res.status(400).json({ error: "unsupported_file_type" });
      return;
    }

    try {
      const [document] = await db
        .insert(documents)
        .values({ userId, filename, mimeType, fileHash, storageKey, documentType, status: "uploaded" })
        .returning();
      if (!document) {
        res.status(500).json({ error: "upload_failed" });
        return;
      }

      const [job] = await db.insert(jobs).values({ documentId: document.id }).returning({ id: jobs.id });
      if (job) await enqueueJob(job.id);

      res.status(201).json({ document });
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "duplicate_upload" });
        return;
      }
      throw err;
    }
  }),
);

documentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const rows = await db
      .select()
      .from(documents)
      .where(eq(documents.userId, req.user!.id))
      .orderBy(desc(documents.createdAt));
    res.json({ documents: rows });
  }),
);

documentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const [document] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, req.params.id!), eq(documents.userId, req.user!.id)));
    if (!document) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const [documentJobs, extracted, checks] = await Promise.all([
      db.select().from(jobs).where(eq(jobs.documentId, document.id)),
      db.select().from(extractedTransactions).where(eq(extractedTransactions.documentId, document.id)),
      db.select().from(verificationChecks).where(eq(verificationChecks.documentId, document.id)),
    ]);
    res.json({ document, jobs: documentJobs, extractedTransactions: extracted, verificationChecks: checks });
  }),
);

const editExtractedRowSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  merchant: z.string().min(1).nullable().optional(),
  description: z.string().nullable().optional(),
  amountCents: z.number().int().positive().optional(),
  direction: directionSchema.optional(),
  category: categorySchema.optional(),
});

documentsRouter.patch(
  "/:id/extracted-transactions/:rowId",
  asyncHandler(async (req, res) => {
    const parsed = editExtractedRowSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
      return;
    }

    const [document] = await db
      .select({ id: documents.id, status: documents.status })
      .from(documents)
      .where(and(eq(documents.id, req.params.id!), eq(documents.userId, req.user!.id)));
    if (!document) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    // Editing is only meaningful pre-promotion: once a document's rows are
    // trusted, corrections go through PATCH /api/transactions/:id instead,
    // which is explicit about the record now being user-sourced.
    if (document.status !== "needs_review") {
      res.status(400).json({ error: "not_editable" });
      return;
    }

    const [row] = await db
      .select({ id: extractedTransactions.id })
      .from(extractedTransactions)
      .where(and(eq(extractedTransactions.id, req.params.rowId!), eq(extractedTransactions.documentId, document.id)));
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const update: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.category) update.categoryConfidence = 1;

    const [updated] = await db
      .update(extractedTransactions)
      .set(update)
      .where(eq(extractedTransactions.id, row.id))
      .returning();

    res.json({ extractedTransaction: updated });
  }),
);

documentsRouter.post(
  "/:id/reverify",
  asyncHandler(async (req, res) => {
    const [document] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, req.params.id!), eq(documents.userId, req.user!.id)));
    if (!document) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (document.status !== "needs_review") {
      res.status(400).json({ error: "not_reviewable" });
      return;
    }

    // Re-runs the same deterministic checks against the (possibly now
    // corrected) staged rows. If everything blocking now passes, this
    // promotes automatically — same decision path a fresh document takes,
    // just re-entered after a human edit instead of after extraction.
    await runVerifyStage(document);

    const [updated] = await db.select().from(documents).where(eq(documents.id, document.id));
    res.json({ document: updated });
  }),
);

documentsRouter.post(
  "/:id/accept",
  asyncHandler(async (req, res) => {
    const [document] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, req.params.id!), eq(documents.userId, req.user!.id)));
    if (!document) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (document.status !== "needs_review") {
      res.status(400).json({ error: "not_reviewable" });
      return;
    }

    const candidates: CandidateRow[] = await db
      .select()
      .from(extractedTransactions)
      .where(eq(extractedTransactions.documentId, document.id));
    const existing: ExistingTransactionRef[] = await db
      .select({
        id: transactions.id,
        date: transactions.date,
        amountCents: transactions.amountCents,
        merchant: transactions.merchant,
      })
      .from(transactions)
      .where(and(eq(transactions.userId, document.userId), ne(transactions.documentId, document.id)));
    const { matches } = checkDuplicateAcrossDocuments(candidates, existing);

    await promoteDocument(document, matches);
    await db
      .update(documents)
      .set({ status: "accepted", statusDetail: null, updatedAt: new Date() })
      .where(eq(documents.id, document.id));

    res.json({ ok: true });
  }),
);

documentsRouter.post(
  "/:id/reject",
  asyncHandler(async (req, res) => {
    const [document] = await db
      .select({ id: documents.id, status: documents.status })
      .from(documents)
      .where(and(eq(documents.id, req.params.id!), eq(documents.userId, req.user!.id)));
    if (!document) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (document.status !== "needs_review") {
      res.status(400).json({ error: "not_reviewable" });
      return;
    }

    await db.delete(transactions).where(eq(transactions.documentId, document.id));
    await db
      .update(documents)
      .set({ status: "rejected", statusDetail: { note: "Rejected by user." }, updatedAt: new Date() })
      .where(eq(documents.id, document.id));

    res.json({ ok: true });
  }),
);

documentsRouter.post(
  "/:id/retry",
  asyncHandler(async (req, res) => {
    const [document] = await db
      .select({ id: documents.id, status: documents.status })
      .from(documents)
      .where(and(eq(documents.id, req.params.id!), eq(documents.userId, req.user!.id)));
    if (!document) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (document.status !== "failed") {
      res.status(400).json({ error: "not_retryable" });
      return;
    }

    await db
      .update(documents)
      .set({ status: "processing", statusDetail: null })
      .where(eq(documents.id, document.id));
    const [job] = await db.insert(jobs).values({ documentId: document.id }).returning({ id: jobs.id });
    if (job) await enqueueJob(job.id);

    res.status(202).json({ ok: true });
  }),
);

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION
  );
}
