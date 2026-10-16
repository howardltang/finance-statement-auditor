import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { useUploadDocument } from "../lib/documents";
import { ApiError } from "../lib/api";

const ERROR_MESSAGES: Record<string, string> = {
  duplicate_upload: "You've already uploaded this exact file.",
  unsupported_file_type: "Unsupported file type. Try a PDF, image, CSV, or XLSX.",
  file_required: "Choose a file first.",
};

export function UploadForm() {
  const upload = useUploadDocument();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleFile(file: File | undefined) {
    if (!file) return;
    upload.mutate(file);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }

  const errorMessage =
    upload.error instanceof ApiError
      ? (ERROR_MESSAGES[upload.error.code ?? ""] ?? "Upload failed. Please try again.")
      : null;

  return (
    <div className="section">
      <div
        className={`dropzone${isDragging ? " dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
      >
        <span className="dropzone-icon" aria-hidden>
          {upload.isPending ? "⏳" : "📄"}
        </span>
        <strong>{upload.isPending ? "Uploading…" : "Drop a document here, or click to choose a file"}</strong>
        <span className="hint">Statements, receipts, or CSV/XLSX exports</span>
        <input
          id="file-upload"
          ref={inputRef}
          type="file"
          accept=".pdf,.csv,.xlsx,.xls,image/*"
          hidden
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>
      {errorMessage && <p className="error-text">{errorMessage}</p>}
    </div>
  );
}
