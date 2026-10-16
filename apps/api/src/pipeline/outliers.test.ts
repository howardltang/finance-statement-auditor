import { describe, expect, it } from "vitest";
import { findOutliers, type OutlierCandidate } from "./outliers.js";

function candidate(overrides: Partial<OutlierCandidate> = {}): OutlierCandidate {
  return {
    id: "c1",
    date: "2026-03-01",
    merchant: "Some Store",
    category: "food",
    amountCents: 2000,
    direction: "debit",
    ...overrides,
  };
}

describe("findOutliers", () => {
  it("does not flag anything when a category has too few samples", () => {
    const candidates = [
      candidate({ id: "a", amountCents: 1000 }),
      candidate({ id: "b", amountCents: 10000 }),
    ];
    expect(findOutliers(candidates)).toHaveLength(0);
  });

  it("flags a transaction well above the category's typical amount", () => {
    const candidates = [
      candidate({ id: "a", amountCents: 1000 }),
      candidate({ id: "b", amountCents: 1100 }),
      candidate({ id: "c", amountCents: 900 }),
      candidate({ id: "d", amountCents: 5000 }),
    ];
    const outliers = findOutliers(candidates);
    expect(outliers).toHaveLength(1);
    expect(outliers[0]?.id).toBe("d");
  });

  it("does not flag transactions within normal range", () => {
    const candidates = [
      candidate({ id: "a", amountCents: 1000 }),
      candidate({ id: "b", amountCents: 1100 }),
      candidate({ id: "c", amountCents: 1200 }),
    ];
    expect(findOutliers(candidates)).toHaveLength(0);
  });

  it("ignores credits — outliers are about spending, not income", () => {
    const candidates = [
      candidate({ id: "a", amountCents: 1000 }),
      candidate({ id: "b", amountCents: 1100 }),
      candidate({ id: "c", amountCents: 900 }),
      candidate({ id: "d", amountCents: 500000, direction: "credit" }),
    ];
    expect(findOutliers(candidates)).toHaveLength(0);
  });

  it("judges each category against its own median independently", () => {
    const candidates = [
      candidate({ id: "a", category: "food", amountCents: 1000 }),
      candidate({ id: "b", category: "food", amountCents: 1100 }),
      candidate({ id: "c", category: "food", amountCents: 900 }),
      candidate({ id: "d", category: "bills", amountCents: 20000 }),
      candidate({ id: "e", category: "bills", amountCents: 21000 }),
      candidate({ id: "f", category: "bills", amountCents: 19000 }),
    ];
    expect(findOutliers(candidates)).toHaveLength(0);
  });
});
