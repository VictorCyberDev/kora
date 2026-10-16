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
  describe("listen port (API_PORT, then PORT, then 3000)", () => {
    const base = { DATABASE_URL: "postgresql://u:p@localhost/db" };
    it("defaults to 3000", () => expect(loadConfig(base).API_PORT).toBe(3000));
    it("falls back to the platform-injected PORT", () =>
      expect(loadConfig({ ...base, PORT: "8080" }).API_PORT).toBe(8080));
    it("API_PORT wins over PORT", () =>
      expect(
        loadConfig({ ...base, API_PORT: "4000", PORT: "8080" }).API_PORT,
      ).toBe(4000));
    it("treats an empty API_PORT as unset", () =>
      expect(loadConfig({ ...base, API_PORT: "", PORT: "8080" }).API_PORT).toBe(
        8080,
      ));
    it("still rejects an invalid port", () => {
      expect(() => loadConfig({ ...base, PORT: "abc" })).toThrow();
      expect(() => loadConfig({ ...base, PORT: "70000" })).toThrow();
    });
    it("binds all interfaces by default", () =>
      expect(loadConfig(base).API_HOST).toBe("0.0.0.0"));
  });
  it("accepts a Rumpty public database URL with sslmode=require", () => {
    const url =
      "postgresql://user:pass@db.example.rumpty.invalid:5432/main_db?sslmode=require";
    expect(loadConfig({ DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });
});
