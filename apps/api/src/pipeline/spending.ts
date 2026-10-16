import type { Category } from "@pfsa/shared";

export interface MonthlySpendingRow {
  date: string;
  category: Category;
  amountCents: number;
}

export interface MonthlyCategoryTotal {
  month: string;
  category: Category;
  debitCents: number;
}

/** Groups debit transactions into per-month, per-category totals for the spending-over-time chart. */
export function aggregateSpendingByMonth(rows: MonthlySpendingRow[]): MonthlyCategoryTotal[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const month = row.date.slice(0, 7); // YYYY-MM
    const key = `${month}|${row.category}`;
    totals.set(key, (totals.get(key) ?? 0) + row.amountCents);
  }

  return [...totals.entries()]
    .map(([key, debitCents]) => {
      const [month, category] = key.split("|") as [string, Category];
      return { month, category, debitCents };
    })
    .sort((a, b) => a.month.localeCompare(b.month));
}
