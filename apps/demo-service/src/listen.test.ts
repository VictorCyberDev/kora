import { describe, expect, it } from "vitest";
import { resolveListen } from "./listen.js";

describe("demo service listen address (DEMO_PORT, then PORT, then 3100)", () => {
  it("defaults to 0.0.0.0:3100", () =>
    expect(resolveListen({})).toEqual({ host: "0.0.0.0", port: 3100 }));
  it("falls back to the platform-injected PORT", () =>
    expect(resolveListen({ PORT: "8080" }).port).toBe(8080));
  it("DEMO_PORT wins over PORT", () =>
    expect(resolveListen({ DEMO_PORT: "4100", PORT: "8080" }).port).toBe(4100));
  it("treats an empty DEMO_PORT as unset", () =>
    expect(resolveListen({ DEMO_PORT: "", PORT: "8080" }).port).toBe(8080));
  it("keeps DEMO_HOST", () =>
    expect(resolveListen({ DEMO_HOST: "127.0.0.1" }).host).toBe("127.0.0.1"));
  it("rejects an invalid port", () => {
    expect(() => resolveListen({ PORT: "abc" })).toThrow();
    expect(() => resolveListen({ PORT: "0" })).toThrow();
  });
});
