import { z } from "zod";

export const CATEGORIES = [
  "food",
  "shopping",
  "transport",
  "bills",
  "income",
  "travel",
  "health",
  "entertainment",
  "subscriptions",
  "transfers",
  "other",
  "uncategorized",
] as const;

export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;
