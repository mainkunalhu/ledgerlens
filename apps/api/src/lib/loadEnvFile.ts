import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { repoRoot } from "./paths.js";

// Load the monorepo-root .env regardless of which workspace dir bun runs from
// (`bun run --filter api` sets cwd to apps/api, where dotenv/config alone
// would miss the root .env and silently leave GROQ_API_KEY empty).
const rootEnv = join(repoRoot(), ".env");
if (existsSync(rootEnv)) config({ path: rootEnv });
