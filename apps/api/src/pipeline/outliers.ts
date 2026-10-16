import type { Category, Direction } from "@pfsa/shared";

export interface OutlierCandidate {
  id: string;
  date: string | null;
  merchant: string | null;
  category: Category;
  amountCents: number;
  direction: Direction;
}

export interface Outlier {
  id: string;
  date: string | null;
  merchant: string | null;
  category: Category;
  amountCents: number;
  medianCents: number;
  ratio: number;
  reason: string;
}

/** A category needs at least this many transactions before "typical" means anything. */
const MIN_SAMPLES = 3;
/** How far above the category's median counts as unusual. */
const RATIO_THRESHOLD = 2.5;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Flags spending transactions well above what's typical for their own
 * category — deliberately per-category (a $200 "bills" charge is normal, a
 * $200 "food" charge probably isn't) rather than one global threshold.
 * Categories with too few transactions to establish a "typical" amount are
 * skipped entirely rather than flagged against noise.
 */
export function findOutliers(candidates: OutlierCandidate[]): Outlier[] {
  const byCategory = new Map<Category, OutlierCandidate[]>();
  for (const c of candidates) {
    if (c.direction !== "debit") continue;
    const list = byCategory.get(c.category) ?? [];
    list.push(c);
    byCategory.set(c.category, list);
  }

  const outliers: Outlier[] = [];
  for (const [category, items] of byCategory) {
    if (items.length < MIN_SAMPLES) continue;
    const med = median(items.map((i) => i.amountCents));
    if (med === 0) continue;

    for (const item of items) {
      const ratio = item.amountCents / med;
      if (ratio < RATIO_THRESHOLD) continue;
      outliers.push({
        id: item.id,
        date: item.date,
        merchant: item.merchant,
        category,
        amountCents: item.amountCents,
        medianCents: med,
        ratio,
        reason: `${ratio.toFixed(1)}x your typical ${category} transaction (usually ~$${(med / 100).toFixed(2)})`,
      });
    }
  }

  return outliers.sort((a, b) => b.ratio - a.ratio);
}
