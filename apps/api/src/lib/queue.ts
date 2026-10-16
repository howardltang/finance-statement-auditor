import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { env } from "../env.js";

const sqs = new SQSClient({});

/**
 * No-op locally — the poll loop in `worker.ts` finds pending jobs on its
 * own. In production, `QUEUE_URL` is set and this is what actually wakes
 * up `worker.lambda.ts`.
 */
export async function enqueueJob(jobId: string): Promise<void> {
  if (!env.QUEUE_URL) return;
  await sqs.send(
    new SendMessageCommand({ QueueUrl: env.QUEUE_URL, MessageBody: JSON.stringify({ jobId }) }),
  );
}
