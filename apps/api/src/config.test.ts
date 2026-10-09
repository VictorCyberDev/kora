import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";
describe("configuration", () => {
  it("rejects missing critical database configuration", () =>
    expect(() => loadConfig({})).toThrow());
  it("rejects invalid thresholds", () =>
    expect(() =>
      loadConfig({
        DATABASE_URL: "postgresql://u:p@localhost/db",
        MONITOR_FAILURE_THRESHOLD: "0",
      }),
    ).toThrow());
});
