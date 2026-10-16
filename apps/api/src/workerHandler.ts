import type { SQSBatchItemFailure, SQSBatchResponse, SQSEvent } from "aws-lambda";
import { claimJobById, handleJobFailure, runJob } from "./pipeline/jobRunner.js";

interface JobMessage {
  jobId: string;
}

/**
 * SQS-triggered replacement for the local poll loop (`worker.ts`). One
 * invocation per batch of messages; a failed record is reported back so SQS
 * redrives only that message (batch item failures), not the whole batch.
 * `claimJobById`'s atomic claim absorbs SQS's at-least-once delivery —
 * a duplicate delivery of an already-claimed job is a silent no-op, not
 * a double-processed document.
 */
export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      const { jobId } = JSON.parse(record.body) as JobMessage;
      const job = await claimJobById(jobId);
      if (!job) {
        console.log(`[worker.lambda] job ${jobId} already claimed, skipping`);
        continue;
      }

      console.log(`[worker.lambda] processing job ${job.id} (document ${job.documentId})`);
      try {
        await runJob(job);
        console.log(`[worker.lambda] job ${job.id} succeeded`);
      } catch (err) {
        console.error(`[worker.lambda] job ${job.id} failed`, err);
        const { dead } = await handleJobFailure(job, err);
        // Still has retries left: report this record back to SQS so it's
        // redelivered later. `claimJobById` resets to `pending` in the
        // meantime, so redelivery just re-attempts it normally.
        if (!dead) batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    } catch (err) {
      console.error(`[worker.lambda] failed to process record ${record.messageId}`, err);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
}
