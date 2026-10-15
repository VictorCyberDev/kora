import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // PostgreSQL-backed suites share one database and some delete all rows.
    fileParallelism: false,
    setupFiles: ["./src/test-support/setup.ts"],
  },
});
