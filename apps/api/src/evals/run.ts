import { readFile, readdir } from "node:fs/promises";
import { extname } from "node:path";
import "dotenv/config";
import type { DocumentType } from "@pfsa/shared";
import { extractFromVisionDocument } from "../pipeline/vision.js";
import { extractFromTabularDocument } from "../pipeline/tabular.js";
import { validateExtraction } from "../pipeline/validate.js";

/**
 * Extraction accuracy eval. Runs the real extractor (real Anthropic calls,
 * real cost — a few cents per run over this fixture set) against a small
 * hand-labeled fixture set and reports precision/recall, so a prompt or
 * model change is judged by a number instead of a vibe. Intentionally
 * strict matching (exact date + amount + direction): a near-miss still
 * counts as a miss, because that's the information worth seeing.
 */

const FIXTURES_DIR = new URL("./fixtures/", import.meta.url);

interface ExpectedTransaction {
  date: string | null;
  merchant: string;
  amountCents: number;
  direction: "debit" | "credit";
  category: string;
}

interface ExpectedFixture {
  documentType: DocumentType;
  statementTotalCents: number | null;
  transactions: ExpectedTransaction[];
}

interface ActualTransaction {
  date: string | null;
  amountCents: number;
  direction: string;
  category: string;
}

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".csv": "text/csv",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

interface Fixture {
  name: string;
  expected: ExpectedFixture;
  buffer: Buffer;
  mimeType: string;
}

async function loadFixtures(): Promise<Fixture[]> {
  const files = await readdir(FIXTURES_DIR);
  const expectedFiles = files.filter((f) => f.endsWith(".expected.json"));

  return Promise.all(
    expectedFiles.map(async (expectedFile): Promise<Fixture> => {
      const name = expectedFile.replace(".expected.json", "");
      const expected: ExpectedFixture = JSON.parse(
        await readFile(new URL(expectedFile, FIXTURES_DIR), "utf-8"),
      );
      const sourceFile = files.find((f) => f.startsWith(`${name}.`) && !f.endsWith(".expected.json"));
      if (!sourceFile) throw new Error(`No source file found for fixture "${name}"`);
      const buffer = await readFile(new URL(sourceFile, FIXTURES_DIR));
      const mimeType = MIME_BY_EXT[extname(sourceFile)] ?? "application/octet-stream";
      return { name, expected, buffer, mimeType };
    }),
  );
}

interface MatchResult {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  categoryMatches: number;
  categoryTotal: number;
}

function scoreFixture(expected: ExpectedTransaction[], actual: ActualTransaction[]): MatchResult {
  const remaining = [...actual];
  let truePositives = 0;
  let categoryMatches = 0;

  for (const exp of expected) {
    const idx = remaining.findIndex(
      (a) => a.amountCents === exp.amountCents && a.direction === exp.direction && a.date === exp.date,
    );
    if (idx === -1) continue;
    truePositives++;
    if (remaining[idx]!.category === exp.category) categoryMatches++;
    remaining.splice(idx, 1);
  }

  return {
    truePositives,
    falsePositives: remaining.length,
    falseNegatives: expected.length - truePositives,
    categoryMatches,
    categoryTotal: expected.length,
  };
}

function pct(n: number, d: number): string {
  return d === 0 ? "n/a" : `${((n / d) * 100).toFixed(0)}%`;
}

async function main() {
  const fixtures = await loadFixtures();
  console.log(`Running extraction eval over ${fixtures.length} fixture(s)...\n`);

  let totalTP = 0;
  let totalFP = 0;
  let totalFN = 0;
  let totalCatMatch = 0;
  let totalCatCount = 0;

  for (const { name, expected, buffer, mimeType } of fixtures) {
    const raw =
      expected.documentType === "pdf_statement" || expected.documentType === "image_receipt"
        ? await extractFromVisionDocument({ buffer, mimeType, documentType: expected.documentType })
        : await extractFromTabularDocument({ buffer, documentType: expected.documentType });

    const validated = validateExtraction(raw);
    const result = scoreFixture(expected.transactions, validated.transactions);

    totalTP += result.truePositives;
    totalFP += result.falsePositives;
    totalFN += result.falseNegatives;
    totalCatMatch += result.categoryMatches;
    totalCatCount += result.categoryTotal;

    const totalLine =
      expected.statementTotalCents === null
        ? "n/a (no stated total for this document type)"
        : validated.statementTotalCents === expected.statementTotalCents
          ? "match"
          : `MISMATCH — got ${validated.statementTotalCents}, expected ${expected.statementTotalCents}`;

    console.log(name);
    console.log(
      `  transactions: ${result.truePositives}/${expected.transactions.length} matched ` +
        `(precision ${pct(result.truePositives, result.truePositives + result.falsePositives)}, ` +
        `recall ${pct(result.truePositives, result.truePositives + result.falseNegatives)})`,
    );
    console.log(`  category accuracy on matched rows: ${pct(result.categoryMatches, result.categoryTotal)}`);
    console.log(`  statement total: ${totalLine}`);
    if (result.falsePositives > 0 || result.falseNegatives > 0) {
      console.log(`  ⚠ ${result.falsePositives} unexpected row(s), ${result.falseNegatives} missed row(s)`);
    }
    console.log("");
  }

  console.log("---");
  console.log(
    `Overall: precision ${pct(totalTP, totalTP + totalFP)}, recall ${pct(totalTP, totalTP + totalFN)}, ` +
      `category accuracy ${pct(totalCatMatch, totalCatCount)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
