import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors "paths" in tsconfig.json so tests can import "@/...".
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The real package throws outside the Next.js server runtime.
      "server-only": fileURLToPath(
        new URL("./src/test/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
