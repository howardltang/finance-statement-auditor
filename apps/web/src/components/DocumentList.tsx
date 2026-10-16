import { Link } from "react-router-dom";
import type { DocumentStatus } from "@pfsa/shared";
import { useDocuments } from "../lib/documents";

const STATUS_BADGE: Record<DocumentStatus, string> = {
  uploaded: "badge-neutral",
  processing: "badge-accent",
  needs_review: "badge-warning",
  accepted: "badge-success",
  rejected: "badge-neutral",
  failed: "badge-danger",
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  return <span className={`badge ${STATUS_BADGE[status]}`}>{status.replace("_", " ")}</span>;
}

export function DocumentList() {
  const { data, isPending, isError } = useDocuments();

  if (isPending) return <p className="hint">Loading documents…</p>;
  if (isError) return <p className="error-text">Couldn't load documents.</p>;
  if (data.documents.length === 0) {
    return (
      <div className="empty-state card">
        <span style={{ fontSize: "1.5rem" }} aria-hidden>
          🗂️
        </span>
        <p>No documents uploaded yet — drop one above to get started.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>File</th>
            <th>Type</th>
            <th>Status</th>
            <th>Uploaded</th>
          </tr>
        </thead>
        <tbody>
          {data.documents.map((doc) => (
            <tr key={doc.id}>
              <td>
                <Link to={`/documents/${doc.id}`}>{doc.filename}</Link>
              </td>
              <td style={{ color: "var(--text-2)" }}>{doc.documentType.replace("_", " ")}</td>
              <td>
                <StatusBadge status={doc.status} />
                {doc.statusDetail?.note && <div className="hint" style={{ marginTop: 4 }}>{doc.statusDetail.note}</div>}
                {doc.statusDetail?.error && (
                  <div className="error-text" style={{ fontSize: 12, marginTop: 4 }}>
                    {doc.statusDetail.error}
                  </div>
                )}
              </td>
              <td style={{ color: "var(--text-2)" }}>{new Date(doc.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
