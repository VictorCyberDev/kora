import { describe, expect, it } from "vitest";
import { assertTestDatabase } from "./test-database.js";

describe("assertTestDatabase", () => {
  it("allows an unset DATABASE_URL (integration suites skip)", () => {
    expect(() => assertTestDatabase(undefined)).not.toThrow();
  });
  it("accepts a database whose name ends in _test", () => {
    expect(() =>
      assertTestDatabase("postgresql://u:p@localhost:5432/kora_test"),
    ).not.toThrow();
    expect(() =>
      assertTestDatabase("postgres://u:p@localhost/kora_test?sslmode=disable"),
    ).not.toThrow();
  });
  it("refuses a non-test database", () => {
    expect(() =>
      assertTestDatabase("postgresql://u:p@localhost:5432/kora"),
    ).toThrow(/must end in "_test"/);
  });
  it("does not substring-match the raw URL", () => {
    expect(() =>
      assertTestDatabase("postgresql://kora_test:p@localhost:5432/kora"),
    ).toThrow();
    expect(() =>
      assertTestDatabase("postgresql://u:p@kora_test.example.com/prod"),
    ).toThrow();
    expect(() =>
      assertTestDatabase("postgresql://u:p@localhost/kora?x=_test"),
    ).toThrow();
    expect(() =>
      assertTestDatabase("postgresql://u:p@localhost/kora_test_prod"),
    ).toThrow();
  });
  it("decodes percent-encoded names", () => {
    expect(() =>
      assertTestDatabase("postgresql://u:p@localhost/kora%5Ftest"),
    ).not.toThrow();
    expect(() =>
      assertTestDatabase("postgresql://u:p@localhost/prod%5Ftest%2Fx"),
    ).toThrow();
  });
  it("refuses an unparseable URL", () => {
    expect(() => assertTestDatabase("not a url")).toThrow(/parseable/);
  });
});
