import type { CheckName } from "@pfsa/shared";
import type { VerificationCheckRow } from "../lib/documentDetail";
import { formatCents } from "../lib/format";

const CHECK_LABELS: Record<CheckName, string> = {
  schema_valid: "Extraction validity",
  completeness: "At least one transaction",
  totals_reconcile: "Totals reconcile",
  date_range_sanity: "Dates within statement period",
  duplicate_within_document: "No duplicates within document",
  duplicate_across_documents: "No duplicates across documents",
};

function describe(check: VerificationCheckRow): string {
  const d = check.details ?? {};
  switch (check.checkName) {
    case "schema_valid":
      return check.passed
        ? `${d.validCount ?? 0} row(s) validated.`
        : `${d.invalidCount ?? 0} row(s) dropped for not matching the expected shape.`;
    case "completeness":
      return check.passed ? `${d.count} transaction(s) found.` : "No transactions were extracted.";
    case "totals_reconcile":
      if (d.reason) return String(d.reason);
      return check.passed
        ? `Statement total ${formatCents(Number(d.statementTotalCents))} matched ${d.matchedAs}.`
        : `Statement total ${formatCents(Number(d.statementTotalCents))} didn't match debits (${formatCents(Number(d.debitCents))}), credits (${formatCents(Number(d.creditCents))}), or net (${formatCents(Number(d.netCents))}).`;
    case "date_range_sanity":
      if (d.reason) return String(d.reason);
      return check.passed
        ? "All dated transactions fall within the statement period."
        : `${d.outOfRangeCount} transaction(s) fall outside ${d.periodStart} – ${d.periodEnd}.`;
    case "duplicate_within_document":
      return check.passed
        ? "No repeated rows within this document."
        : `${d.duplicateGroupCount} group(s) of repeated rows found.`;
    case "duplicate_across_documents":
      return check.passed
        ? "No matches against your existing transactions."
        : `${d.matchCount} transaction(s) look like they may already exist from another document.`;
    default:
      return "";
  }
}

function statusVariant(check: VerificationCheckRow): "success" | "warning" | "danger" {
  if (check.passed) return "success";
  return check.severity === "blocking" ? "danger" : "warning";
}

const ICON = { success: "✓", warning: "⚠", danger: "✕" };

export function VerificationChecksList({ checks }: { checks: VerificationCheckRow[] }) {
  if (checks.length === 0) return <p className="hint">No checks have run yet.</p>;

  return (
    <div className="table-wrap" style={{ padding: "0.4rem" }}>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        {checks.map((check) => {
          const variant = statusVariant(check);
          return (
            <li
              key={check.id}
              style={{
                display: "flex",
                gap: "0.85rem",
                alignItems: "flex-start",
                padding: "0.7rem 0.85rem",
                borderRadius: "var(--radius-sm)",
              }}
              className={`badge-${variant}`}
            >
              <span
                aria-hidden
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: `var(--${variant})`,
                  color: "white",
                  fontSize: 12,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {ICON[variant]}
              </span>
              <span>
                <strong style={{ color: "var(--text)", display: "block", fontSize: "0.9rem" }}>
                  {CHECK_LABELS[check.checkName]}
                </strong>
                <span style={{ color: "var(--text-2)", fontSize: "0.85rem" }}>{describe(check)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
