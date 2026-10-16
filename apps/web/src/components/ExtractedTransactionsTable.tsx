import { useState } from "react";
import { CATEGORIES, type Category, type Direction } from "@pfsa/shared";
import { useEditExtractedRow, type ExtractedRow } from "../lib/documentDetail";
import { formatCents } from "../lib/format";

function EditableRow({
  documentId,
  row,
  editable,
}: {
  documentId: string;
  row: ExtractedRow;
  editable: boolean;
}) {
  const edit = useEditExtractedRow(documentId);
  const [date, setDate] = useState(row.date ?? "");
  const [merchant, setMerchant] = useState(row.merchant ?? "");
  const [amount, setAmount] = useState((row.amountCents / 100).toFixed(2));
  const [direction, setDirection] = useState<Direction>(row.direction);
  const [category, setCategory] = useState<Category>(row.category);

  const parsedAmountCents = Math.round(Number.parseFloat(amount || "0") * 100);
  const dirty =
    date !== (row.date ?? "") ||
    merchant !== (row.merchant ?? "") ||
    parsedAmountCents !== row.amountCents ||
    direction !== row.direction ||
    category !== row.category;

  if (!editable) {
    return (
      <tr>
        <td>{row.date ?? <span className="hint">—</span>}</td>
        <td>{row.merchant ?? <span className="hint">—</span>}</td>
        <td style={{ color: row.direction === "debit" ? "var(--danger)" : "var(--success)", fontWeight: 600 }}>
          {row.direction === "debit" ? "−" : "+"}
          {formatCents(row.amountCents)}
        </td>
        <td style={{ color: "var(--text-2)" }}>{row.direction}</td>
        <td>
          <span className="badge badge-neutral">{row.category}</span>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </td>
      <td>
        <input className="input" value={merchant} onChange={(e) => setMerchant(e.target.value)} style={{ minWidth: 160 }} />
      </td>
      <td>
        <input
          className="input"
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ width: 90 }}
        />
      </td>
      <td>
        <select className="select" value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
          <option value="debit">debit</option>
          <option value="credit">credit</option>
        </select>
      </td>
      <td>
        <select className="select" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </td>
      <td>
        <button
          className="btn btn-secondary btn-sm"
          disabled={!dirty || edit.isPending}
          onClick={() =>
            edit.mutate({
              rowId: row.id,
              edit: { date: date || null, merchant: merchant || null, amountCents: parsedAmountCents, direction, category },
            })
          }
        >
          {edit.isPending ? "Saving…" : "Save"}
        </button>
      </td>
    </tr>
  );
}

export function ExtractedTransactionsTable({
  documentId,
  rows,
  editable,
}: {
  documentId: string;
  rows: ExtractedRow[];
  editable: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="empty-state card">
        <p>No transactions were extracted from this document.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Merchant</th>
            <th>Amount</th>
            <th>Direction</th>
            <th>Category</th>
            {editable && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <EditableRow key={row.id} documentId={documentId} row={row} editable={editable} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
