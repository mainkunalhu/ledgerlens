import "../lib/loadEnvFile.js";
import "dotenv/config";
import { closeDb, getSql } from "./client.js";

const MIGRATION_URL = new URL("./schema.sql", import.meta.url);

/** Apply schema.sql idempotently. Safe to run on every boot. */
export async function migrate(): Promise<void> {
  const sql = getSql();
  const schema = await Bun.file(MIGRATION_URL).text();
  await sql.unsafe(schema);
}

if (import.meta.main) {
  try {
    await migrate();
    console.log("migration ok");
  } catch (err) {
    console.error("migration failed:", err);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
