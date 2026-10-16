import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Files run serially; each gets its own fresh database (see test-support/setup.ts).
    fileParallelism: false,
    setupFiles: ["./src/test-support/setup.ts"],
  },
});
