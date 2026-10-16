import { Link, useNavigate, useParams } from "react-router-dom";
import {
  useAcceptDocument,
  useDocumentDetail,
  useRejectDocument,
  useReverifyDocument,
} from "../lib/documentDetail";
import { StatusBadge } from "../components/DocumentList";
import { VerificationChecksList } from "../components/VerificationChecksList";
import { ExtractedTransactionsTable } from "../components/ExtractedTransactionsTable";
import { formatCents } from "../lib/format";

export default function DocumentReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isPending, isError } = useDocumentDetail(id!);
  const reverify = useReverifyDocument(id!);
  const accept = useAcceptDocument(id!);
  const reject = useRejectDocument(id!);
  const busy = reverify.isPending || accept.isPending || reject.isPending;

  if (isPending) return <p className="hint">Loading…</p>;
  if (isError || !data) return <p className="error-text">Couldn't load this document.</p>;

  const { document, extractedTransactions, verificationChecks } = data;
  const editable = document.status === "needs_review";

  return (
    <>
      <div className="section-header">
        <Link to="/" className="hint" style={{ textDecoration: "none" }}>
          ← Back to documents
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.25rem" }}>
          <h1>{document.filename}</h1>
          <StatusBadge status={document.status} />
        </div>
        <p>
          {document.statementTotalCents != null && (
            <>Statement total: {formatCents(document.statementTotalCents)}</>
          )}
          {document.statusDetail?.note && (document.statementTotalCents != null ? " · " : "") + document.statusDetail.note}
        </p>
      </div>

      <div className="section">
        <div className="section-header">
          <h2>Verification</h2>
        </div>
        <VerificationChecksList checks={verificationChecks} />
      </div>

      <div className="section">
        <div className="section-header">
          <h2>Transactions</h2>
          {editable && <p>Correct any fields below, then accept or reject.</p>}
        </div>
        <ExtractedTransactionsTable documentId={document.id} rows={extractedTransactions} editable={editable} />
      </div>

      {editable && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", flexWrap: "wrap" }}>
            <button className="btn btn-secondary" onClick={() => reverify.mutate()} disabled={busy}>
              {reverify.isPending ? "Re-checking…" : "Re-check"}
            </button>
            <span className="hint">
              Re-runs verification against your corrections — promotes automatically if it now passes.
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
            <button
              className="btn btn-primary"
              onClick={() => accept.mutate(undefined, { onSuccess: () => navigate("/") })}
              disabled={busy}
            >
              {accept.isPending ? "Accepting…" : "Accept anyway"}
            </button>
            <button
              className="btn btn-danger"
              onClick={() => reject.mutate(undefined, { onSuccess: () => navigate("/") })}
              disabled={busy}
            >
              {reject.isPending ? "Rejecting…" : "Reject"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
