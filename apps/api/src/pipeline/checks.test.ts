import { describe, expect, it } from "vitest";
import {
  checkCompleteness,
  checkDateRangeSanity,
  checkDuplicateWithinDocument,
  checkTotalsReconcile,
  findCrossDocumentDuplicates,
  type CandidateRow,
  type ExistingTransactionRef,
} from "./checks.js";

function row(overrides: Partial<CandidateRow> = {}): CandidateRow {
  return {
    id: "row-1",
    date: "2026-03-01",
    merchant: "Whole Foods",
    amountCents: 1000,
    direction: "debit",
    ...overrides,
  };
}

describe("checkCompleteness", () => {
  it("fails (blocking) when there are no candidates", () => {
    const result = checkCompleteness([]);
    expect(result.passed).toBe(false);
    expect(result.severity).toBe("blocking");
  });

  it("passes when there's at least one candidate", () => {
    expect(checkCompleteness([row()]).passed).toBe(true);
  });
});

describe("checkTotalsReconcile", () => {
  it("passes trivially when the document declared no total", () => {
    const result = checkTotalsReconcile([row({ amountCents: 500 })], null);
    expect(result.passed).toBe(true);
  });

  it("passes when the declared total matches total debits", () => {
    const candidates = [row({ amountCents: 500, direction: "debit" }), row({ amountCents: 300, direction: "debit" })];
    expect(checkTotalsReconcile(candidates, 800).passed).toBe(true);
  });

  it("passes when the declared total matches total credits", () => {
    const candidates = [row({ amountCents: 200, direction: "credit" })];
    expect(checkTotalsReconcile(candidates, 200).passed).toBe(true);
  });

  it("passes when the declared total matches the net of debits and credits", () => {
    const candidates = [row({ amountCents: 1000, direction: "debit" }), row({ amountCents: 400, direction: "credit" })];
    expect(checkTotalsReconcile(candidates, 600).passed).toBe(true);
  });

  it("tolerates a 1-cent rounding difference", () => {
    const candidates = [row({ amountCents: 999, direction: "debit" })];
    expect(checkTotalsReconcile(candidates, 1000).passed).toBe(true);
  });

  it("fails when nothing reconciles", () => {
    const candidates = [row({ amountCents: 500, direction: "debit" })];
    const result = checkTotalsReconcile(candidates, 9999);
    expect(result.passed).toBe(false);
    expect(result.severity).toBe("blocking");
  });
});

describe("checkDateRangeSanity", () => {
  it("passes when there's no known statement period", () => {
    expect(checkDateRangeSanity([row({ date: "2020-01-01" })], null, null).passed).toBe(true);
  });

  it("passes when every dated row falls inside the period", () => {
    const candidates = [row({ date: "2026-03-15" })];
    expect(checkDateRangeSanity(candidates, "2026-03-01", "2026-03-31").passed).toBe(true);
  });

  it("does not penalize undated rows", () => {
    const candidates = [row({ date: null })];
    expect(checkDateRangeSanity(candidates, "2026-03-01", "2026-03-31").passed).toBe(true);
  });

  it("flags (as a warning, not blocking) a row outside the period", () => {
    const candidates = [row({ date: "2026-04-15" })];
    const result = checkDateRangeSanity(candidates, "2026-03-01", "2026-03-31");
    expect(result.passed).toBe(false);
    expect(result.severity).toBe("warning");
  });
});

describe("checkDuplicateWithinDocument", () => {
  it("passes when no two rows share date+amount+merchant", () => {
    const candidates = [row({ id: "a", amountCents: 100 }), row({ id: "b", amountCents: 200 })];
    expect(checkDuplicateWithinDocument(candidates).passed).toBe(true);
  });

  it("flags exact-duplicate rows", () => {
    const candidates = [row({ id: "a" }), row({ id: "b" })];
    const result = checkDuplicateWithinDocument(candidates);
    expect(result.passed).toBe(false);
    expect(result.severity).toBe("warning");
  });

  it("treats merchant matching as case/punctuation-insensitive", () => {
    const candidates = [
      row({ id: "a", merchant: "Whole Foods #123" }),
      row({ id: "b", merchant: "whole foods 123" }),
    ];
    expect(checkDuplicateWithinDocument(candidates).passed).toBe(false);
  });
});

function existing(overrides: Partial<ExistingTransactionRef> = {}): ExistingTransactionRef {
  return { id: "existing-1", date: "2026-03-01", amountCents: 1000, merchant: "Whole Foods", ...overrides };
}

describe("findCrossDocumentDuplicates", () => {
  it("matches same amount, nearby date, and similar merchant", () => {
    const matches = findCrossDocumentDuplicates(
      [row({ id: "candidate-1", date: "2026-03-02", amountCents: 1000, merchant: "Whole Foods Market" })],
      [existing()],
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.existingTransactionId).toBe("existing-1");
  });

  it("does not match when the amount differs", () => {
    const matches = findCrossDocumentDuplicates(
      [row({ amountCents: 500 })],
      [existing({ amountCents: 1000 })],
    );
    expect(matches).toHaveLength(0);
  });

  it("does not match when the dates are too far apart", () => {
    const matches = findCrossDocumentDuplicates(
      [row({ date: "2026-01-01", amountCents: 1000 })],
      [existing({ date: "2026-06-01", amountCents: 1000 })],
    );
    expect(matches).toHaveLength(0);
  });

  it("does not match when merchants are unrelated", () => {
    const matches = findCrossDocumentDuplicates(
      [row({ merchant: "Shell Gas Station", amountCents: 1000 })],
      [existing({ merchant: "Whole Foods", amountCents: 1000 })],
    );
    expect(matches).toHaveLength(0);
  });

  it("never matches a candidate with no date — not enough signal to be confident", () => {
    const matches = findCrossDocumentDuplicates([row({ date: null, amountCents: 1000 })], [existing()]);
    expect(matches).toHaveLength(0);
  });
});
