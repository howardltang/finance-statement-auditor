import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Category, Direction } from "@pfsa/shared";
import { apiFetch } from "./api";

export interface Transaction {
  id: string;
  documentId: string;
  date: string | null;
  merchant: string | null;
  description: string | null;
  amountCents: number;
  direction: Direction;
  account: string | null;
  category: Category;
  categorySource: "llm" | "user" | "rule";
  isUncategorized: boolean;
  needsDateReview: boolean;
  createdAt: string;
}

export interface TransactionTotals {
  debitCents: number;
  creditCents: number;
  netCents: number;
  count: number;
}

export interface TransactionFilters {
  category?: Category;
  dateFrom?: string;
  dateTo?: string;
  undated?: boolean;
}

function buildQuery(filters: TransactionFilters): string {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  if (filters.undated) params.set("undated", "true");
  else {
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useTransactions(filters: TransactionFilters) {
  return useQuery({
    queryKey: ["transactions", filters],
    queryFn: () =>
      apiFetch<{ transactions: Transaction[]; totals: TransactionTotals }>(
        `/transactions${buildQuery(filters)}`,
      ),
  });
}

export function useRecategorize() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, category }: { id: string; category: Category }) =>
      apiFetch<{ transaction: Transaction }>(`/transactions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ category }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["transactions"] }),
  });
}
