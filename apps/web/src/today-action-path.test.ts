import { describe, expect, it } from "vitest";
import { todayActionPath } from "./today-action-path.js";

describe("Today action routing", () => {
  it("routes health to real operations instead of nonexistent site health", () => {
    expect(todayActionPath("site-1", "health")).toBe("/app/operations");
  });
  it("routes customer, approval, and identity work to existing screens", () => {
    expect(todayActionPath("site-1", "customers")).toBe(
      "/app/sites/site-1/customers",
    );
    expect(todayActionPath("site-1", "calendar")).toBe(
      "/app/sites/site-1/calendar",
    );
    expect(todayActionPath("site-1", "identity")).toBe(
      "/app/sites/site-1/identity",
    );
  });
  it("refuses arbitrary untrusted server destinations", () => {
    expect(todayActionPath("site-1", "https://phish.example")).toBe(
      "/app/sites/site-1/today",
    );
    expect(todayActionPath("site-1", "../../billing")).toBe(
      "/app/sites/site-1/today",
    );
  });
});
