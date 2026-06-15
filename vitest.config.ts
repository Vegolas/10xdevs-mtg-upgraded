import path from "node:path";
import { defineConfig } from "vitest/config";

// Mirrors the `@/*` -> `./src/*` alias from tsconfig.json so tests import the
// same way app code does.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
