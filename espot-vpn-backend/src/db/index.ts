import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "../env.js";
import * as schema from "./schema.js";

const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  ssl: env.databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });
export { schema };
export * from "./schema.js";
