import type { DocumentType } from "@pfsa/shared";
import { extractionResultSchema } from "@pfsa/shared";
import { anthropic, toolSchemaFrom, VISION_MODEL } from "../lib/anthropic.js";

const TOOL_NAME = "record_extraction";

const EXTRACTION_PROMPT = `You are extracting transactions from a personal finance document (a bank/credit card statement, or a single receipt).

Call ${TOOL_NAME} exactly once with your best-effort structured extraction. Rules:
- A "transaction" is a single charge or deposit on an account — the unit that would appear as one line on a bank or card statement. A single receipt is ALWAYS exactly one transaction, using its printed total, even if it lists several purchased items: those items are not separate transactions, and splitting them into multiple rows would create charges that never actually happened on any account. A multi-page bank/card statement genuinely has many transactions — extract each of those separately.
- Include every transaction you can find. Do not skip one just because a field is uncertain.
- date: YYYY-MM-DD. If illegible, cropped, or genuinely absent, use null — do not guess a date.
- merchant: the payee/merchant name as written. Use null if you truly cannot tell.
- amountCents: a positive integer, the absolute value of the transaction amount in cents (e.g. $12.34 -> 1234).
- direction: "debit" for money leaving the account (purchases, fees), "credit" for money arriving (deposits, refunds, payments received).
- accountHint: last 4 digits or account nickname if shown on the document, else null.
- category: your best guess from the allowed list. Use "uncategorized" (with low categoryConfidence) rather than forcing a guess you're not confident in.
- statementTotalCents: if the document prints its own total anywhere — a receipt's "TOTAL" line just as much as a statement's ending balance — put it here (cents). This is independent of how many transactions you extracted; a one-transaction receipt still has a printed total. Use null only when no such figure appears on the document at all.
- periodStart / periodEnd: the statement's billing period, if shown. A single receipt has no period — use null.

Never fabricate a value to fill a field. Null is always preferable to a guess.`;

interface VisionInput {
  buffer: Buffer;
  mimeType: string;
  documentType: Extract<DocumentType, "pdf_statement" | "image_receipt">;
}

export async function extractFromVisionDocument({ buffer, mimeType, documentType }: VisionInput) {
  const base64 = buffer.toString("base64");

  const documentBlock =
    documentType === "pdf_statement"
      ? ({
          type: "document" as const,
          source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 },
        })
      : ({
          type: "image" as const,
          source: { type: "base64" as const, media_type: mimeType as "image/jpeg", data: base64 },
        });

  const message = await anthropic.messages.create({
    model: VISION_MODEL,
    max_tokens: 8192,
    tools: [
      {
        name: TOOL_NAME,
        description: "Record the transactions and metadata extracted from this financial document.",
        input_schema: toolSchemaFrom(extractionResultSchema),
      },
    ],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [
      {
        role: "user",
        content: [documentBlock, { type: "text", text: EXTRACTION_PROMPT }],
      },
    ],
  });

  const toolUse = message.content.find((block) => block.type === "tool_use");
  return toolUse?.input ?? { transactions: [] };
}
