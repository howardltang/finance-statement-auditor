import { z } from "zod";
import { processingStageSchema, type ProcessingStage } from "./document.js";

export const JOB_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "dead",
] as const;
export const jobStatusSchema = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export { processingStageSchema };
export type { ProcessingStage };

/**
 * Discriminated union mirroring the columns actually used by each job
 * status, so e.g. a `pending` job can't be constructed with a `lastError`
 * and a `dead` job can't be constructed without one.
 */
export type JobState =
  | { status: "pending"; stage: ProcessingStage; availableAt: Date }
  | { status: "running"; stage: ProcessingStage }
  | { status: "succeeded"; stage: "promote" }
  | {
      status: "failed";
      stage: ProcessingStage;
      lastError: string;
      attempts: number;
      availableAt: Date;
    }
  | { status: "dead"; stage: ProcessingStage; lastError: string; attempts: number };
