import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import {
  CATEGORIES,
  CHECK_NAMES,
  DIRECTIONS,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  JOB_STATUSES,
  PROCESSING_STAGES,
  SEVERITIES,
} from "@pfsa/shared";

export const categoryEnum = pgEnum("category", CATEGORIES);
export const directionEnum = pgEnum("direction", DIRECTIONS);
export const documentTypeEnum = pgEnum("document_type", DOCUMENT_TYPES);
export const documentStatusEnum = pgEnum("document_status", DOCUMENT_STATUSES);
export const jobStatusEnum = pgEnum("job_status", JOB_STATUSES);
export const processingStageEnum = pgEnum("processing_stage", PROCESSING_STAGES);
export const checkNameEnum = pgEnum("check_name", CHECK_NAMES);
export const severityEnum = pgEnum("severity", SEVERITIES);
export const categorySourceEnum = pgEnum("category_source", ["llm", "user", "rule"]);
export const duplicateResolutionEnum = pgEnum("duplicate_resolution", [
  "kept_both",
  "merged",
  "dismissed",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    fileHash: text("file_hash").notNull(),
    storageKey: text("storage_key").notNull(),
    documentType: documentTypeEnum("document_type").notNull(),
    status: documentStatusEnum("status").notNull().default("uploaded"),
    statusDetail: jsonb("status_detail"),
    statementPeriodStart: date("statement_period_start"),
    statementPeriodEnd: date("statement_period_end"),
    statementTotalCents: integer("statement_total_cents"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("documents_user_file_hash_unique").on(table.userId, table.fileHash),
    index("documents_user_status_idx").on(table.userId, table.status),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    status: jobStatusEnum("status").notNull().default("pending"),
    stage: processingStageEnum("stage").notNull().default("extract"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("jobs_status_available_idx").on(table.status, table.availableAt)],
);

/**
 * Staging only. Never read by the browsing/review UI's totals or filters —
 * only the promote step reads this table, and only for documents that have
 * passed (or been manually cleared through) verification.
 */
export const extractedTransactions = pgTable("extracted_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  date: date("date"),
  merchant: text("merchant"),
  description: text("description"),
  amountCents: integer("amount_cents").notNull(),
  direction: directionEnum("direction").notNull(),
  accountHint: text("account_hint"),
  category: categoryEnum("category").notNull(),
  categoryConfidence: real("category_confidence").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** The trusted table. Only source for transaction lists, totals, and charts. */
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    extractedTransactionId: uuid("extracted_transaction_id").references(
      () => extractedTransactions.id,
      { onDelete: "set null" },
    ),
    date: date("date"),
    merchant: text("merchant"),
    description: text("description"),
    amountCents: integer("amount_cents").notNull(),
    direction: directionEnum("direction").notNull(),
    account: text("account"),
    category: categoryEnum("category").notNull(),
    categorySource: categorySourceEnum("category_source").notNull().default("llm"),
    isUncategorized: boolean("is_uncategorized").notNull().default(false),
    needsDateReview: boolean("needs_date_review").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("transactions_user_date_idx").on(table.userId, table.date),
    index("transactions_user_category_idx").on(table.userId, table.category),
  ],
);

export const verificationChecks = pgTable("verification_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  checkName: checkNameEnum("check_name").notNull(),
  passed: boolean("passed").notNull(),
  severity: severityEnum("severity").notNull(),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const duplicateFlags = pgTable("duplicate_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  transactionIdA: uuid("transaction_id_a")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  transactionIdB: uuid("transaction_id_b")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  matchReason: text("match_reason").notNull(),
  confidence: real("confidence").notNull(),
  resolved: boolean("resolved").notNull().default(false),
  resolution: duplicateResolutionEnum("resolution"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  documents: many(documents),
  transactions: many(transactions),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  user: one(users, { fields: [documents.userId], references: [users.id] }),
  jobs: many(jobs),
  extractedTransactions: many(extractedTransactions),
  transactions: many(transactions),
  verificationChecks: many(verificationChecks),
}));

export const jobsRelations = relations(jobs, ({ one }) => ({
  document: one(documents, { fields: [jobs.documentId], references: [documents.id] }),
}));

export const extractedTransactionsRelations = relations(extractedTransactions, ({ one }) => ({
  document: one(documents, {
    fields: [extractedTransactions.documentId],
    references: [documents.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, { fields: [transactions.userId], references: [users.id] }),
  document: one(documents, { fields: [transactions.documentId], references: [documents.id] }),
  extractedTransaction: one(extractedTransactions, {
    fields: [transactions.extractedTransactionId],
    references: [extractedTransactions.id],
  }),
}));

export const verificationChecksRelations = relations(verificationChecks, ({ one }) => ({
  document: one(documents, {
    fields: [verificationChecks.documentId],
    references: [documents.id],
  }),
}));
