import "dotenv/config";
import { serve } from "@hono/node-server";
import app from "./app.js";
import { loadEnv } from "./lib/env.js";

const env = loadEnv();

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`ledgerlens-api listening on http://localhost:${info.port}`);
});
