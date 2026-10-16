import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthlyCategoryTotal } from "../lib/analytics";
import { formatCents } from "../lib/format";

// Fixed categorical order + validated palette (dataviz skill, adjacent-pair mode).
// A 9th+ category folds into a shared "other" bucket rather than generating a new hue.
const CHART_CATEGORY_ORDER = [
  "food",
  "shopping",
  "transport",
  "bills",
  "entertainment",
  "subscriptions",
  "travel",
  "health",
] as const;
const CATEGORY_COLORS: Record<string, string> = {
  food: "#2a78d6",
  shopping: "#eb6834",
  transport: "#1baf7a",
  bills: "#eda100",
  entertainment: "#e87ba4",
  subscriptions: "#008300",
  travel: "#4a3aa7",
  health: "#e34948",
};
const OTHER_COLOR = "#898781";
const INK = "#52514e";
const GRID = "#e1e0d9";

interface ChartRow {
  month: string;
  [category: string]: string | number;
}

function pivot(series: MonthlyCategoryTotal[]): { rows: ChartRow[]; categories: string[] } {
  const rowsByMonth = new Map<string, ChartRow>();
  const categoryTotals = new Map<string, number>();

  for (const point of series) {
    const row = rowsByMonth.get(point.month) ?? { month: point.month };
    const bucket = CHART_CATEGORY_ORDER.includes(point.category as (typeof CHART_CATEGORY_ORDER)[number])
      ? point.category
      : "other";
    row[bucket] = (Number(row[bucket]) || 0) + point.debitCents;
    rowsByMonth.set(point.month, row);
    categoryTotals.set(bucket, (categoryTotals.get(bucket) ?? 0) + point.debitCents);
  }

  const rows = [...rowsByMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  // Render order follows the fixed palette order (present categories only), "other" last.
  const categories = CHART_CATEGORY_ORDER.filter((c) => categoryTotals.has(c));
  if (categoryTotals.has("other")) categories.push("other" as (typeof CHART_CATEGORY_ORDER)[number]);

  return { rows, categories };
}

export function SpendingChart({ series }: { series: MonthlyCategoryTotal[] }) {
  if (series.length === 0) return <p>Not enough dated, categorized spending yet to chart trends.</p>;

  const { rows, categories } = pivot(series);

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={rows} barCategoryGap={16}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="month" stroke={INK} tick={{ fill: INK, fontSize: 12 }} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis
          stroke={INK}
          tick={{ fill: INK, fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => formatCents(v)}
          width={70}
        />
        <Tooltip formatter={(value: number) => formatCents(value)} />
        <Legend wrapperStyle={{ fontSize: 13, color: INK }} />
        {categories.map((category) => (
          <Bar
            key={category}
            dataKey={category}
            name={category}
            stackId="spend"
            fill={CATEGORY_COLORS[category] ?? OTHER_COLOR}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
