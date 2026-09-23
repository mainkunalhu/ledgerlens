import { Hono } from "hono";
import { dbHealth } from "../db/client.js";

export const health = new Hono();

health.get("/", async (c) => {
  const db = await dbHealth();
  const ok = db.ok;
  return c.json({ ok, ts: new Date().toISOString(), db }, ok ? 200 : 503);
});
