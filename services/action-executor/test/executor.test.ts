import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RumptyCli,
  assertIdent,
  classifyProcess,
  redact,
  runProcess,
} from "../src/index.js";

const ENV = { PATH: process.env.PATH ?? "/usr/bin:/bin" };

describe("safe process runner", () => {
  it("refuses executables outside the allow-list", async () => {
    await expect(
      runProcess("sh", ["-c", "echo hi"], new Set(["echo"]), {
        timeoutMs: 1000,
        env: ENV,
      }),
    ).rejects.toThrow(/allow-listed/);
  });
  it("never interprets shell syntax in arguments", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kora-exec-"));
    const marker = join(dir, "pwned");
    const hostile = `x; touch ${marker}; $(touch ${marker}) \`touch ${marker}\` | touch ${marker}`;
    const out = await runProcess("echo", [hostile], new Set(["echo"]), {
      timeoutMs: 2000,
      env: ENV,
    });
    expect(out.stdout.trim()).toBe(hostile);
    expect(() => readFileSync(marker)).toThrow();
  });
  it("kills slow processes and reports a timeout", async () => {
    const out = await runProcess("sleep", ["5"], new Set(["sleep"]), {
      timeoutMs: 100,
      env: ENV,
    });
    expect(out.timedOut).toBe(true);
    expect(classifyProcess(out).outcome).toBe("TIMED_OUT");
  });
  it("does not inherit the parent environment", async () => {
    process.env.KORA_TEST_SECRET = "leak-me";
    const out = await runProcess("env", [], new Set(["env"]), {
      timeoutMs: 2000,
      env: ENV,
    });
    expect(out.stdout).not.toContain("leak-me");
  });
  it("redacts secret-shaped output", () => {
    expect(redact("key rmp_abcdef123456 token=zzz sk_live_abc123")).not.toMatch(
      /rmp_abc|zzz|sk_live_abc/,
    );
  });
});

describe("rumpty cli wrapper", () => {
  const cli = () =>
    new RumptyCli({
      executable: "rumpty",
      apiKey: "rmp_secret",
      workspace: "kora-01a11b00",
    });
  it("validates identifiers so values cannot become flags or paths", () => {
    for (const bad of ["--public", "a b", "a;b", "../x", "$(x)", "", "-rf"])
      expect(() => assertIdent(bad, "x")).toThrow();
    expect(() => assertIdent("kora-sites", "x")).not.toThrow();
  });
  it("rejects hostile bucket/prefix before spawning anything", async () => {
    await expect(
      cli().syncFolder("/tmp/x", "b; rm -rf /", "p", { public: true }),
    ).rejects.toThrow(/invalid bucket/);
    await expect(
      cli().syncFolder("/tmp/x", "b", "../../etc", { public: true }),
    ).rejects.toThrow(/invalid prefix/);
    await expect(
      cli().syncFolder("relative", "b", "p", { public: true }),
    ).rejects.toThrow(/absolute/);
  });
  it("reports a missing CLI as an error, never as success", async () => {
    writeFileSync(join(mkdtempSync(join(tmpdir(), "k-")), "x"), "");
    await expect(
      new RumptyCli({
        executable: "rumpty-not-installed",
        apiKey: "k",
        workspace: "w",
      }).listWorkspaces(),
    ).rejects.toThrow();
  });
});
