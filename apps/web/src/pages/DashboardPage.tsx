import { UploadForm } from "../components/UploadForm";
import { DocumentList } from "../components/DocumentList";

export default function DashboardPage() {
  return (
    <>
      <div className="page-header">
        <h1>Documents</h1>
        <p>Upload statements, receipts, and exports — we'll extract and verify the transactions.</p>
      </div>
      <UploadForm />
      <div className="section">
        <div className="section-header">
          <h2>Recent uploads</h2>
        </div>
        <DocumentList />
      </div>
    </>
  );
}
