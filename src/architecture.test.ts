import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC_DIR = fileURLToPath(new URL(".", import.meta.url));

/** Source files under a folder of src/, excluding tests. */
function sourceFiles(folder: string): string[] {
  const root = join(SRC_DIR, folder);
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((entry) => /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry))
    .map((entry) => join(root, entry));
}

describe("layering", () => {
  it("starts every file in src/server with the server-only import", () => {
    const missing = sourceFiles("server")
      .filter((file) => !/^import "server-only";$/m.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC_DIR, file));
    expect(missing).toEqual([]);
  });

  it("makes every signed-in page call a page guard", () => {
    // A layout is not rendered again on client-side navigation, so each page
    // has to check access itself. This catches a new page that forgets to.
    const unguarded = sourceFiles("app")
      .filter((file) => /[\\/]\(app\)[\\/].*page\.tsx$/.test(file))
      .filter(
        (file) => !/\b(requirePageUser|requireAllowed)\(/.test(readFileSync(file, "utf8")),
      )
      .map((file) => relative(SRC_DIR, file));
    expect(unguarded).toEqual([]);
  });

  it("keeps src/domain and src/permissions free of server and framework code", () => {
    const forbidden =
      /(?:from\s+|import\s+)["'](?:@\/server|server-only|next|react)(?:\/[^"']*)?["']/;
    const offenders = [...sourceFiles("domain"), ...sourceFiles("permissions")]
      .filter((file) => forbidden.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC_DIR, file));
    expect(offenders).toEqual([]);
  });
});
