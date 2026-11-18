import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SEED_ACCOUNTS } from "@/server/seed/users";

/**
 * The README and AGENTS.md are part of what this project hands in. These tests
 * keep them from drifting away from the code they describe.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (name: string) => readFileSync(join(ROOT, name), "utf8");

describe("README", () => {
  const readme = read("README.md");

  it("lists every seeded account with its password in one table row", () => {
    const rows = readme.split("\n");
    const missing = SEED_ACCOUNTS.filter((account) => {
      const row = rows.find((line) => line.includes(account.email));
      return !row || !row.includes(account.password);
    }).map((account) => account.email);
    expect(missing).toEqual([]);
  });
});

describe("README and AGENTS.md", () => {
  const documents = ["README.md", "AGENTS.md"].map((name) => ({
    name,
    text: read(name),
  }));

  it("only mention files and folders that exist", () => {
    const path = /`((?:src|scripts|e2e)\/[A-Za-z0-9_./()[\]-]+)`/g;
    const missing: string[] = [];
    for (const { name, text } of documents) {
      for (const match of text.matchAll(path)) {
        const target = match[1] ?? "";
        const found = [target, `${target}.ts`, `${target}.tsx`].some((candidate) =>
          existsSync(join(ROOT, candidate)),
        );
        if (!found) missing.push(`${name}: ${target}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("only mention npm scripts that exist", () => {
    const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>;
    const missing: string[] = [];
    for (const { name, text } of documents) {
      for (const match of text.matchAll(/npm run ([a-z0-9:-]+)/g)) {
        const script = match[1] ?? "";
        if (!(script in scripts)) missing.push(`${name}: npm run ${script}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("CLAUDE.md", () => {
  it("imports AGENTS.md instead of repeating it", () => {
    expect(read("CLAUDE.md").trim()).toBe("@AGENTS.md");
  });
});
