import postgres from "postgres";
import { loadEnv } from "../lib/env.js";

let sqlInstance: postgres.Sql | null = null;

export function getSql(): postgres.Sql {
  if (sqlInstance) return sqlInstance;
  const env = loadEnv();
  sqlInstance = postgres(env.DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
  return sqlInstance;
}

export async function dbHealth(): Promise<{
  ok: boolean;
  latencyMs?: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const sql = getSql();
    await sql`SELECT 1 AS ok`;
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function closeDb(): Promise<void> {
  if (sqlInstance) {
    await sqlInstance.end({ timeout: 5 });
    sqlInstance = null;
  }
}
