import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { ALL_ROLES } from "./roles";

const SRC_DIR = fileURLToPath(new URL("..", import.meta.url));
const ROLES_FILE = fileURLToPath(new URL("./roles.ts", import.meta.url));

/**
 * Rule 6 holds only while roles.ts is the one place that spells out a role.
 * Use ROLES.X or ROLE_DEFINITIONS instead of a quoted role string. If a
 * quoted string is a false positive, rename it rather than loosen this test.
 */
it("keeps quoted role strings out of every file except roles.ts", () => {
  const quotedRole = new RegExp(`(["'\`])(${ALL_ROLES.join("|")})\\1`);
  const offenders: string[] = [];

  for (const entry of readdirSync(SRC_DIR, {
    recursive: true,
    encoding: "utf8",
  })) {
    if (!/\.tsx?$/.test(entry)) continue;
    const file = join(SRC_DIR, entry);
    if (file === ROLES_FILE) continue;

    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (quotedRole.test(line)) {
          offenders.push(`${relative(SRC_DIR, file)}:${index + 1}  ${line.trim()}`);
        }
      });
  }

  expect(offenders).toEqual([]);
});
