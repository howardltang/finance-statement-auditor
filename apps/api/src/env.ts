import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_COOKIE_NAME: z.string().default("pfsa_session"),
  UPLOAD_DIR: z.string().default("./uploads"),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  ANTHROPIC_API_KEY: z.string().optional(),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  UPLOADS_BUCKET: z.string().optional(),
  QUEUE_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const env = parsed.data;
