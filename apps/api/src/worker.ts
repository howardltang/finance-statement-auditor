import { and, eq, lt, lte } from "drizzle-orm";
import { db } from "./db/client.js";
import { jobs } from "./db/schema.js";
import { handleJobFailure, runJob, type Job } from "./pipeline/jobRunner.js";

const POLL_INTERVAL_MS = 2000;
/** A job stuck in `running` longer than this is assumed to belong to a crashed/hung worker and gets reclaimed. */
const JOB_LEASE_MS = 2 * 60 * 1000;

/**
 * Local-dev poll loop. Production uses `worker.lambda.ts` instead, triggered
 * by SQS — this file exists so `pnpm dev:worker` keeps working without
 * needing any AWS resources.
 *
 * Claims the oldest due job with `SELECT ... FOR UPDATE SKIP LOCKED`, so
 * multiple worker processes can run against the same queue without ever
 * double-claiming a row (at-least-once delivery, not at-most-once — the
 * pipeline stages must tolerate being re-run for the same document).
 */
async function claimNextJob(): Promise<Job | null> {
  return db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, "pending"), lte(jobs.availableAt, new Date())))
      .orderBy(jobs.availableAt)
      .limit(1)
      .for("update", { of: jobs, skipLocked: true });

    if (!job) return null;

    await tx
      .update(jobs)
      .set({ status: "running", updatedAt: new Date() })
      .where(eq(jobs.id, job.id));

    return job;
  });
}

/**
 * A job that's been `running` past its lease almost certainly belongs to a
 * worker that crashed or hung mid-pipeline — nothing else would leave it
 * there, since a normal run always ends in `succeeded`/`pending`/`dead`.
 * Reclaiming it through the normal failure path (rather than silently
 * resetting it to `pending`) keeps attempt counting and the eventual
 * `dead`/`failed` state consistent with any other kind of failure. Only
 * relevant to this polling model — the Lambda path relies on SQS's own
 * visibility timeout and DLQ for the equivalent behavior.
 */
async function reapStaleJobs(): Promise<void> {
  const staleBefore = new Date(Date.now() - JOB_LEASE_MS);
  const staleJobs = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, "running"), lt(jobs.updatedAt, staleBefore)));

  for (const job of staleJobs) {
    console.warn(`[worker] reaping stale job ${job.id} (no update in over ${JOB_LEASE_MS}ms)`);
    await handleJobFailure(job, new Error("Job exceeded its processing lease — worker likely crashed or hung."));
  }
}

async function tick(): Promise<void> {
  await reapStaleJobs();

  const job = await claimNextJob();
  if (!job) return;

  console.log(`[worker] processing job ${job.id} (document ${job.documentId})`);
  try {
    await runJob(job);
    console.log(`[worker] job ${job.id} succeeded`);
  } catch (err) {
    console.error(`[worker] job ${job.id} failed`, err);
    await handleJobFailure(job, err);
  }
}

async function loop(): Promise<void> {
  console.log("Worker started, polling for jobs...");
  for (;;) {
    try {
      await tick();
    } catch (err) {
      console.error("[worker] tick failed", err);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

loop();
