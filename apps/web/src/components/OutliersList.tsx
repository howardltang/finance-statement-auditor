import { useOutliers } from "../lib/analytics";
import { formatCents } from "../lib/format";

export function OutliersList() {
  const { data, isPending, isError } = useOutliers();

  if (isPending) return <p className="hint">Loading…</p>;
  if (isError) return <p className="error-text">Couldn't load outliers.</p>;
  if (data.outliers.length === 0) {
    return (
      <div className="empty-state card">
        <span style={{ fontSize: "1.5rem" }} aria-hidden>
          ✅
        </span>
        <p>Nothing unusual — or not enough history per category to tell yet.</p>
      </div>
    );
  }

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      {data.outliers.map((o) => (
        <li key={o.id} className="card badge-warning" style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
          <span>
            <strong style={{ color: "var(--text)" }}>{o.merchant ?? "Unknown merchant"}</strong>
            <span className="hint"> — {o.date ?? "undated"}</span>
            <div className="hint" style={{ marginTop: 2 }}>
              {o.reason}
            </div>
          </span>
          <strong style={{ color: "var(--text)", whiteSpace: "nowrap" }}>{formatCents(o.amountCents)}</strong>
        </li>
      ))}
    </ul>
  );
}
