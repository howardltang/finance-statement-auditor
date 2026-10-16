import { useMutation, useQuery } from "@tanstack/react-query";
import type { Category } from "@pfsa/shared";
import { apiFetch } from "./api";

export interface MonthlyCategoryTotal {
  month: string;
  category: Category;
  debitCents: number;
}

export function useSpendingByMonth() {
  return useQuery({
    queryKey: ["analytics", "spending-by-month"],
    queryFn: () => apiFetch<{ series: MonthlyCategoryTotal[] }>("/analytics/spending-by-month"),
  });
}

export interface Outlier {
  id: string;
  date: string | null;
  merchant: string | null;
  category: Category;
  amountCents: number;
  medianCents: number;
  ratio: number;
  reason: string;
}

export function useOutliers() {
  return useQuery({
    queryKey: ["analytics", "outliers"],
    queryFn: () => apiFetch<{ outliers: Outlier[] }>("/analytics/outliers"),
  });
}

export function useAskAboutSpending() {
  return useMutation({
    mutationFn: (question: string) =>
      apiFetch<{ answer: string }>("/analytics/ask", {
        method: "POST",
        body: JSON.stringify({ question }),
      }),
  });
}
