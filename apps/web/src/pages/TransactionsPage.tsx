import { useState } from "react";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { CATEGORIES, type Category } from "@pfsa/shared";
import { useRecategorize, useTransactions, type Transaction } from "../lib/transactions";
import { formatCents } from "../lib/format";

const columnHelper = createColumnHelper<Transaction>();

function CategoryCell({ transaction }: { transaction: Transaction }) {
  const recategorize = useRecategorize();
  return (
    <select
      className="select"
      value={transaction.category}
      disabled={recategorize.isPending}
      onChange={(e) => recategorize.mutate({ id: transaction.id, category: e.target.value as Category })}
      style={{
        width: "auto",
        color: transaction.categorySource === "user" ? "var(--accent)" : "var(--text)",
        fontWeight: transaction.categorySource === "user" ? 600 : 400,
      }}
    >
      {CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}

const columns = [
  columnHelper.accessor("date", {
    header: "Date",
    cell: (info) => info.getValue() ?? <span className="hint">undated</span>,
  }),
  columnHelper.accessor("merchant", {
    header: "Merchant",
    cell: (info) => info.getValue() ?? <span className="hint">—</span>,
  }),
  columnHelper.display({
    id: "category",
    header: "Category",
    cell: ({ row }) => <CategoryCell transaction={row.original} />,
  }),
  columnHelper.accessor("amountCents", {
    header: "Amount",
    cell: (info) => {
      const t = info.row.original;
      return (
        <span style={{ color: t.direction === "debit" ? "var(--danger)" : "var(--success)", fontWeight: 600 }}>
          {t.direction === "debit" ? "−" : "+"}
          {formatCents(t.amountCents)}
        </span>
      );
    },
  }),
];

export default function TransactionsPage() {
  const [category, setCategory] = useState<Category | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [undated, setUndated] = useState(false);

  const { data, isPending, isError } = useTransactions({
    category: category || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    undated: undated || undefined,
  });

  const table = useReactTable({
    data: data?.transactions ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  return (
    <>
      <div className="page-header">
        <h1>Transactions</h1>
        <p>Every transaction that's passed verification, filterable by category and date.</p>
      </div>

      <div className="card" style={{ display: "flex", gap: "1.25rem", alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field" style={{ minWidth: 160 }}>
          <label htmlFor="category-filter">Category</label>
          <select
            id="category-filter"
            className="select"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category | "")}
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="date-from">From</label>
          <input
            id="date-from"
            className="input"
            type="date"
            value={dateFrom}
            disabled={undated}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="date-to">To</label>
          <input
            id="date-to"
            className="input"
            type="date"
            value={dateTo}
            disabled={undated}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.88rem", color: "var(--text-2)" }}>
          <input type="checkbox" checked={undated} onChange={(e) => setUndated(e.target.checked)} />
          Undated only
        </label>
      </div>

      {isPending && <p className="hint">Loading…</p>}
      {isError && <p className="error-text">Couldn't load transactions.</p>}

      {data && (
        <>
          <div className="stat-row">
            <div className="stat-tile">
              <span className="stat-label">Spent</span>
              <span className="stat-value" style={{ color: "var(--danger)" }}>
                {formatCents(data.totals.debitCents)}
              </span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Received</span>
              <span className="stat-value" style={{ color: "var(--success)" }}>
                {formatCents(data.totals.creditCents)}
              </span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Net</span>
              <span className="stat-value">{formatCents(data.totals.netCents)}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Count</span>
              <span className="stat-value">{data.totals.count}</span>
            </div>
          </div>

          {data.transactions.length === 0 ? (
            <div className="empty-state card">
              <p>No transactions match these filters.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
