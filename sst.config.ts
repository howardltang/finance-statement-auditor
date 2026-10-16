/// <reference path="./.sst/platform/config.d.ts" />

/**
 * Deploys the Personal Finance Statement Auditor to AWS.
 *
 * - API: a single Lambda wrapping the existing Express app, no route
 *   changes needed.
 * - Worker: SQS + a Lambda subscriber, reusing the same pipeline functions
 *   (`runExtractStage`/`runVerifyStage`) the local poll-loop worker calls —
 *   only the trigger mechanism changes.
 * - Uploads: an S3 bucket, presigned PUT for direct browser upload.
 * - Frontend: a Vite build served as a static site.
 * - Everything (API, worker, frontend) sits behind one `Router` — one
 *   CloudFront distribution, `/api/*` routed to the API Lambda and
 *   everything else to the static site — so the app and API share an
 *   origin even without a custom domain. That keeps the session cookie
 *   same-site instead of needing `SameSite=None` cross-site cookies, and
 *   sidesteps a circular dependency (frontend needs the API's URL, API's
 *   CORS needs the frontend's URL) entirely: the frontend just calls
 *   `/api/...` as a relative path, exactly like the local Vite dev proxy
 *   already does.
 * - Database: Neon (external) — `DATABASE_URL` is an `sst.Secret`, not an
 *   AWS resource.
 */
export default $config({
  app(input) {
    return {
      name: "pfsa",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    const databaseUrl = new sst.Secret("DatabaseUrl");
    const anthropicApiKey = new sst.Secret("AnthropicApiKey");

    // Default CORS (all origins/methods incl. PUT) already supports
    // presigned browser uploads; nothing else reads from this bucket.
    const bucket = new sst.aws.Bucket("Uploads");

    const dlq = new sst.aws.Queue("ProcessingDLQ");
    const queue = new sst.aws.Queue("ProcessingQueue", {
      // Comfortably above how long extraction (an LLM call) should ever
      // take, and above the worker Lambda's own timeout below, so SQS
      // never re-delivers a message while it's still legitimately running.
      visibilityTimeout: "6 minutes",
      // Matches `jobs.maxAttempts`'s default (5) so the app's own
      // attempt-counting in Postgres is the authority on when to give up;
      // SQS's DLQ is a backstop for failures the app never even sees
      // (e.g. the Lambda crashing before it can record anything).
      dlq: { queue: dlq.arn, retry: 5 },
    });

    const router = new sst.aws.Router("Router");

    const api = new sst.aws.Function("Api", {
      handler: "apps/api/src/lambda.handler",
      url: { router: { instance: router, path: "/api" } },
      link: [bucket, queue],
      timeout: "30 seconds",
      environment: {
        NODE_ENV: "production",
        STORAGE_DRIVER: "s3",
        DATABASE_URL: databaseUrl.value,
        ANTHROPIC_API_KEY: anthropicApiKey.value,
        UPLOADS_BUCKET: bucket.name,
        QUEUE_URL: queue.url,
      },
    });

    queue.subscribe(
      {
        handler: "apps/api/src/workerHandler.handler",
        link: [bucket],
        timeout: "5 minutes",
        environment: {
          NODE_ENV: "production",
          STORAGE_DRIVER: "s3",
          DATABASE_URL: databaseUrl.value,
          ANTHROPIC_API_KEY: anthropicApiKey.value,
          UPLOADS_BUCKET: bucket.name,
        },
      },
      { batch: { size: 5 } },
    );

    const web = new sst.aws.StaticSite("Web", {
      path: "apps/web",
      build: { command: "npm run build", output: "dist" },
      router: { instance: router },
      environment: {
        VITE_UPLOAD_MODE: "presigned",
      },
    });

    return {
      url: router.url,
      api: api.url,
      web: web.url,
    };
  },
});
