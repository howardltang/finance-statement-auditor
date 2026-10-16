import Anthropic from "@anthropic-ai/sdk";
import type { ZodType } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { env } from "../env.js";

export const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

/** Vision-capable, used where misreads directly hurt trust (statement/receipt extraction). */
export const VISION_MODEL = "claude-sonnet-5";
/** Text-only, cheaper — used for lighter judgment calls (categorization, column mapping). */
export const TEXT_MODEL = "claude-haiku-4-5-20251001";

/** Tool input_schema derived from a Zod schema — one definition drives both the runtime check and what we ask the model for. */
export function toolSchemaFrom(schema: ZodType): Anthropic.Tool.InputSchema {
  const jsonSchema = zodToJsonSchema(schema, { target: "jsonSchema7", $refStrategy: "none" }) as Record<
    string,
    unknown
  >;
  delete jsonSchema.$schema;
  return jsonSchema as Anthropic.Tool.InputSchema;
}
