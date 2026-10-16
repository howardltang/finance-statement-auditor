import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { documents, jobs } from "../db/schema.js";
import { runExtractStage } from "./extract.js";
import { runVerifyStage } from "./verify.js";

export type Job = typeof jobs.$inferSelect;

const BASE_BACKOFF_MS = 5000;

/**
 * Atomically claims one job by id — an `UPDATE ... WHERE status = 'pending'`
 * compare-and-set. Returns null if it was already claimed (by a concurrent
 * poll, or by a duplicate SQS delivery of the same message), which is the
 * expected, harmless outcome of at-least-once delivery rather than an error.
 */
export async function claimJobById(jobId: string): Promise<Job | null> {
  const [job] = await db
    .update(jobs)
    .set({ status: "running", updatedAt: new Date() })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, "pending")))
    .returning();
  return job ?? null;
}

/** Runs the pipeline for a claimed job: extract, then verify (which itself decides accept vs. needs_review). */
export async function runJob(job: Job): Promise<void> {
  const [document] = await db.select().from(documents).where(eq(documents.id, job.documentId));
  if (!document) throw new Error(`document ${job.documentId} not found`);

  await db
    .update(documents)
    .set({ status: "processing", updatedAt: new Date() })
    .where(eq(documents.id, job.documentId));

  await runExtractStage(document);

  const [refreshed] = await db.select().from(documents).where(eq(documents.id, job.documentId));
  if (!refreshed) throw new Error(`document ${job.documentId} disappeared mid-pipeline`);
  await runVerifyStage(refreshed);

  await db
    .update(jobs)
    .set({ status: "succeeded", updatedAt: new Date() })
    .where(eq(jobs.id, job.id));
}

/**
 * Returns whether the job still has attempts left (`dead: false`) or has
 * given up (`dead: true`). The local poll loop doesn't need this — it just
 * re-scans for due `pending` jobs on its own. The SQS-triggered Lambda path
 * does: once a Lambda invocation returns without reporting a batch item
 * failure, SQS deletes the message for good — nothing else would ever
 * re-trigger a job that only backed off in the database. So the caller
 * there reports the record back to SQS as failed (for redelivery) whenever
 * this returns `dead: false`, and lets it go (no redelivery) once `dead`.
 */
export async function handleJobFailure(job: Job, error: unknown): Promise<{ dead: boolean }> {
  const message = error instanceof Error ? error.message : String(error);
  const attempts = job.attempts + 1;
  const dead = attempts >= job.maxAttempts;

  await db
    .update(jobs)
    .set({
      status: dead ? "dead" : "pending",
      attempts,
      lastError: message,
      availableAt: new Date(Date.now() + BASE_BACKOFF_MS * 2 ** job.attempts),
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, job.id));

  if (dead) {
    await db
      .update(documents)
      .set({ status: "failed", statusDetail: { error: message }, updatedAt: new Date() })
      .where(eq(documents.id, job.documentId));
  }

  return { dead };
}
