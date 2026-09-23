import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Repo root = dir containing package.json named "ledgerlens". */
export function repoRoot(): string {
  let dir = process.cwd();
  while (true) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      if (pkg?.name === "ledgerlens") return dir;
    } catch {
      // keep walking up
    }
    const parent = dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}
