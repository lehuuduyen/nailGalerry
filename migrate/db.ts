import { Pool } from "pg";
import { databaseUrl } from "./env";

// Single shared pool for the migration scripts. Neon requires TLS; the
// connection string carries `sslmode=require`. We pass an ssl object so node
// doesn't choke on certificate negotiation in a one-off CLI context.
export const pool = new Pool({
  connectionString: databaseUrl(),
  ssl: { rejectUnauthorized: false },
  max: 5,
});

export async function closePool(): Promise<void> {
  await pool.end();
}
