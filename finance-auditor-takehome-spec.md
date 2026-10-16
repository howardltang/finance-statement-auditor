# Project: Personal Finance Statement Auditor

> Everything below is guidelines and suggestions, not a rigid spec. If you have a better idea, a different angle, or a direction you're excited about — take the project wherever you want. Owning those decisions (and being able to explain them) is worth more than checking every box here.

## The idea

Your financial records live in a bunch of messy formats: PDF bank statements, credit-card statements, photos of receipts, spreadsheet exports. Build a web app where a user uploads these documents, the app extracts and categorizes the transactions inside them, checks that the extracted data can actually be trusted, and shows it all in a UI for review.

## Constraints

- TypeScript, backend and frontend.
- Deployed on AWS within free-tier limits. Other providers are fine for pieces AWS makes painful (e.g., hosted Postgres) — just be able to justify the choice.

## MVP

**Ingestion**

- Take uploads of at least: PDF statements, images/screenshots of receipts or statements, and Excel/CSV exports. Assume real-world messy — inconsistent layouts, multi-page docs, cropped photos.
- Processing a document may take tens of seconds. The UI should stay responsive, show per-document status, and survive a page refresh mid-processing.

**Extraction & categorization**

- Turn each document into structured transactions (date, merchant/description, amount, direction, account) with a defined schema.
- Classify each transaction into a spending category (food, shopping, transport, bills, income, etc.). The category set is your call.

**Verification**

This is the heart of the project. LLM output is a proposal, not truth — there needs to be a deterministic layer (plain code, no AI) that checks extractions before they're accepted. For example: do the extracted transactions reconcile against the statement's own totals? Are there duplicates across overlapping uploads?

Should documents that fail checks should land in a "needs review" state a human resolves in the UI, get accepted, or dropped.

**Review & browsing UI**

- A screen to review flagged documents: what was extracted, what check failed, and a way to correct or accept.
- A transaction list with filtering by category and date range, plus basic totals.

## Bonus features (roughly in order of value)

1. **Spending over time** — per-category trends across months, charted.
2. **Outlier flagging** — surface unusual transactions and explain why they were flagged.
3. **AI analysis** — a monthly summary, or a Q&A agent ("why was March so expensive?") that works over your stored data.
4. **Recurring-charge detection** — subscriptions, price increases over time.
5. **Learning from corrections** — when the user recategorizes something, similar future transactions benefit.
6. **Realtime processing progress** instead of polling.

## Product thinking

Beyond the code, spend some time on who this is actually for. If the user is an average person like you and me — not an accountant — what's the most useful thing this app could do for them? How often would they realistically open it? What would make them upload a second document after the first?

Be ready to talk about what you added, removed, or changed based on that. "I cut X because a normal person would never use it" is a great answer; features that only make sense in a demo are not. Real products are shaped by these calls just as much as by the tech.

## Food for thought

Open questions worth chewing on as you design. You're not expected to answer all of them — but they're the kind of thing I'll poke at, and having *considered* them shows in the design.

- Uploads don't arrive in purchase order. Someone might upload March's statement, then January's, then a receipt from last year. Does anything in your design quietly assume otherwise?
- Some receipts have clear dates, some are blurry or missing them entirely. What happens to a transaction you can't date? What about one you can't categorize — is "uncategorized" a real state or a silent fallback?
- A receipt and a bank statement can describe the *same* purchase. What happens when both get uploaded?
- Where's the trust boundary? If the model returns malformed or partial output, what stops it from reaching your database?
- What happens when step three of a five-step pipeline fails? When the same document is uploaded twice?
- Why should processing be async at all? What breaks first at 100× the volume?
- On the frontend: how are you managing server state? If the answer involves `useEffect`, do you know why and what the alternatives are?
- What actually deserves tests here, and what's just glue?
- How do you *know* your extraction is accurate — and how would you know a change made it worse?

## Things to look into

Topics worth researching before/while you build. Not a checklist to use everything — knowing why you *didn't* use something counts too.

- **ETL pipelines** — the extract → transform → load pattern: staging raw data before transforming it, keeping steps idempotent (safe to re-run), and what happens when a step fails halfway.
- **LLM structured outputs** — getting a model to return JSON that conforms to a schema, and validating it at runtime instead of trusting it. Look at how the big provider SDKs (Anthropic, OpenAI) support this natively.
- **Vision models for documents** — sending PDFs/images to a multimodal model vs. classic OCR vs. text extraction libraries. Each has different failure modes; messy receipts will find them.
- **Agents & tool use** — the difference between a single LLM call and an agent loop (model calls tools, sees results, decides what to do next). When is the loop worth it, and when is one well-designed call better?
- **Evals** — measuring LLM output quality against a labeled test set so prompt changes are driven by numbers, not vibes. Even 20–30 labeled documents changes how you work.
- **AWS fundamentals** — Lambda, S3, SQS, and IAM at minimum. Understand what a presigned URL is (uploading files to S3 without routing them through your server) and why queues exist (decoupling slow work from HTTP requests).
- **Infrastructure as code** — defining your AWS resources in code (SST, CDK, Terraform) instead of clicking around the console. Makes "deploy it now" a one-command answer.
- **Async job processing** — job states, retries, and what "at-least-once delivery" means for your code (hint: the same job can run twice).
- **Postgres + an ORM** — schema design, migrations, and where to enforce constraints (DB vs. application code). Drizzle and Prisma are the common TypeScript picks.
- **Runtime validation** — Zod (or similar) for validating anything that crosses a boundary you don't control: uploads, API bodies, model output. Bonus: one schema can generate both the runtime check and the TypeScript type.
- **TypeScript type design** — discriminated unions for modeling states (a job that's `pending | processing | needs_review | done`), exhaustive switches, and making invalid states impossible to construct.
- **React server state** — how libraries like TanStack Query handle fetching, caching, and refetching, and why hand-rolling it with `useEffect` is considered a footgun.