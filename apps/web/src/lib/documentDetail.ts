import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Category, CheckName, Direction, Severity } from "@pfsa/shared";
import { apiFetch } from "./api";
import type { Document } from "./documents";

export interface ExtractedRow {
  id: string;
  documentId: string;
  date: string | null;
  merchant: string | null;
  description: string | null;
  amountCents: number;
  direction: Direction;
  accountHint: string | null;
  category: Category;
  categoryConfidence: number;
}

export interface VerificationCheckRow {
  id: string;
  checkName: CheckName;
  passed: boolean;
  severity: Severity;
  details: Record<string, unknown> | null;
}

export interface DocumentDetail {
  document: Document;
  extractedTransactions: ExtractedRow[];
  verificationChecks: VerificationCheckRow[];
}

function detailQueryKey(id: string) {
  return ["documents", id] as const;
}

export function useDocumentDetail(id: string) {
  return useQuery({
    queryKey: detailQueryKey(id),
    queryFn: () => apiFetch<DocumentDetail>(`/documents/${id}`),
  });
}

export interface ExtractedRowEdit {
  date?: string | null;
  merchant?: string | null;
  description?: string | null;
  amountCents?: number;
  direction?: Direction;
  category?: Category;
}

export function useEditExtractedRow(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rowId, edit }: { rowId: string; edit: ExtractedRowEdit }) =>
      apiFetch<{ extractedTransaction: ExtractedRow }>(
        `/documents/${documentId}/extracted-transactions/${rowId}`,
        { method: "PATCH", body: JSON.stringify(edit) },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: detailQueryKey(documentId) }),
  });
}

export function useReverifyDocument(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ document: Document }>(`/documents/${documentId}/reverify`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: detailQueryKey(documentId) });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export function useAcceptDocument(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ ok: true }>(`/documents/${documentId}/accept`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: detailQueryKey(documentId) });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export function useRejectDocument(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ ok: true }>(`/documents/${documentId}/reject`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: detailQueryKey(documentId) });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}
