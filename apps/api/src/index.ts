import "dotenv/config";
import { serve } from "@hono/node-server";
import app from "./app.js";
import { migrate } from "./db/migrate.js";
import { loadEnv } from "./lib/env.js";
import { ensureStorageDir } from "./lib/storage.js";

const env = loadEnv();

// Best-effort boot migration so `bun dev` works without manual steps.
// Phase 7 (Docker/CI) runs `bun src/db/migrate.ts` explicitly instead.
try {
  await ensureStorageDir();
  await migrate();
  console.log("db migration ok");
} catch (err) {
  console.warn(
    "db migration skipped (is Postgres running?):",
    err instanceof Error ? err.message : err,
  );
}

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`ledgerlens-api listening on http://localhost:${info.port}`);
});
