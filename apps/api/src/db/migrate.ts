import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { env } from "../env.js";

const sql = postgres(env.DATABASE_URL, { max: 1 });
const db = drizzle(sql);

await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrations applied.");
await sql.end();
