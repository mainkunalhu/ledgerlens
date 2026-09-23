import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { documents } from "./routes/documents.js";
import { health } from "./routes/health.js";
import { qa } from "./routes/qa.js";

const app = new Hono();

app.use("*", logger());
app.use("*", cors({ origin: ["http://localhost:3000"], credentials: true }));

app.route("/health", health);
app.route("/documents", documents);
app.route("/qa", qa);

app.get("/", (c) =>
  c.json({ name: "ledgerlens-api", version: "0.4.0", phase: 4 }),
);

export default app;
