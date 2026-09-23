import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { repoRoot } from "./paths.js";
import { storageDir } from "./storage.js";

describe("paths", () => {
  test("repoRoot finds the monorepo root", async () => {
    const root = repoRoot();
    const pkg = JSON.parse(await Bun.file(join(root, "package.json")).text()) as {
      name: string;
    };
    expect(pkg.name).toBe("ledgerlens");
  });

  test("storageDir resolves inside the repo root", () => {
    expect(storageDir().startsWith(repoRoot())).toBe(true);
  });
});
