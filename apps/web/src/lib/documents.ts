import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DocumentStatus, DocumentType } from "@pfsa/shared";
import { apiFetch, apiUpload, ApiError } from "./api";

export interface Document {
  id: string;
  filename: string;
  documentType: DocumentType;
  status: DocumentStatus;
  statusDetail: { note?: string; error?: string } | null;
  statementPeriodStart: string | null;
  statementPeriodEnd: string | null;
  statementTotalCents: number | null;
  createdAt: string;
}

const documentsQueryKey = ["documents"] as const;

const IN_FLIGHT_STATUSES: DocumentStatus[] = ["uploaded", "processing"];

export function useDocuments() {
  return useQuery({
    queryKey: documentsQueryKey,
    queryFn: () => apiFetch<{ documents: Document[] }>("/documents"),
    refetchInterval: (query) => {
      const docs = query.state.data?.documents ?? [];
      const hasInFlight = docs.some((d) => IN_FLIGHT_STATUSES.includes(d.status));
      return hasInFlight ? 2000 : false;
    },
  });
}

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Production upload path: hash the file client-side, ask the API for a
 * presigned S3 URL (rejecting an exact duplicate before any bytes move —
 * an improvement on the local flow, which can only dedupe after receiving
 * the full upload), PUT directly to S3, then tell the API the upload is done.
 */
async function uploadViaPresignedUrl(file: File): Promise<{ document: Document }> {
  const fileHash = await sha256Hex(file);
  const mimeType = file.type || "application/octet-stream";

  const { uploadUrl, storageKey } = await apiFetch<{ uploadUrl: string; storageKey: string }>(
    "/documents/presign",
    { method: "POST", body: JSON.stringify({ filename: file.name, mimeType, fileHash }) },
  );

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: file,
  });
  if (!putRes.ok) throw new ApiError("Upload to storage failed", putRes.status);

  return apiFetch<{ document: Document }>("/documents/confirm", {
    method: "POST",
    body: JSON.stringify({ storageKey, filename: file.name, mimeType, fileHash }),
  });
}

function uploadDirectly(file: File): Promise<{ document: Document }> {
  const formData = new FormData();
  formData.append("file", file);
  return apiUpload<{ document: Document }>("/documents", formData);
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      import.meta.env.VITE_UPLOAD_MODE === "presigned" ? uploadViaPresignedUrl(file) : uploadDirectly(file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: documentsQueryKey }),
  });
}
