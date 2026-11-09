import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ConfigError,
  FLAG_SYNTAX,
  loadPlatformConfig,
  releaseWarnings,
} from "./config.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../../..");

const load = (env: Record<string, string>) =>
  loadPlatformConfig({ NODE_ENV: "test", ...env });
const issuesOf = (env: Record<string, string>) => {
  try {
    load(env);
  } catch (e) {
    if (e instanceof ConfigError) return e;
    throw e;
  }
  throw new Error("expected a ConfigError");
};

describe("release switches: the documented syntax", () => {
  it("accepts exactly the documented staging values", () => {
    const c = load({
      KORA_CREATIVE_ENGINE: "v3",
      KORA_MEDIA_UNSPLASH: "off",
      KORA_MODEL_COMPOSE: "false",
    });
    expect(c.KORA_CREATIVE_ENGINE).toBe("v3");
    expect(c.KORA_MEDIA_UNSPLASH).toBe("off");
    expect(c.KORA_MODEL_COMPOSE).toBe(false);
  });
  it("reads each switch independently", () => {
    expect(load({ KORA_MODEL_COMPOSE: "true" }).KORA_MODEL_COMPOSE).toBe(true);
    expect(load({ KORA_MODEL_COMPOSE: "true" }).KORA_CREATIVE_ENGINE).toBe(
      "v2",
    );
    expect(load({ KORA_CREATIVE_ENGINE: "v3" }).KORA_MODEL_COMPOSE).toBe(false);
    expect(load({ KORA_MEDIA_UNSPLASH: "on" }).KORA_MEDIA_UNSPLASH).toBe("on");
    expect(load({}).KORA_MEDIA_UNSPLASH).toBeUndefined();
  });
  it("defaults every switch to off / v2 so an unset environment changes nothing", () => {
    const c = load({});
    expect(c.KORA_CREATIVE_ENGINE).toBe("v2");
    expect(c.KORA_MODEL_COMPOSE).toBe(false);
    expect(c.KORA_COPY_ASSIST).toBe(false);
  });
  it("treats empty and whitespace-only values as unset, and trims stray whitespace", () => {
    expect(load({ KORA_MODEL_COMPOSE: "" }).KORA_MODEL_COMPOSE).toBe(false);
    expect(load({ KORA_MODEL_COMPOSE: "  " }).KORA_MODEL_COMPOSE).toBe(false);
    expect(load({ KORA_MODEL_COMPOSE: "true " }).KORA_MODEL_COMPOSE).toBe(true);
    expect(load({ KORA_CREATIVE_ENGINE: " v3" }).KORA_CREATIVE_ENGINE).toBe(
      "v3",
    );
  });
});

describe("release switches: invalid values stop the release loudly and name the variable", () => {
  const bad: Array<[keyof typeof FLAG_SYNTAX, string]> = [
    ["KORA_MODEL_COMPOSE", "on"], // the value the staging notes once documented
    ["KORA_MODEL_COMPOSE", "1"],
    ["KORA_MODEL_COMPOSE", "yes"],
    ["KORA_MODEL_COMPOSE", "TRUE"],
    ["KORA_COPY_ASSIST", "on"],
    ["KORA_CREATIVE_ENGINE", "v4"],
    ["KORA_CREATIVE_ENGINE", "V3"],
    ["KORA_CREATIVE_ENGINE", "3"],
    ["KORA_MEDIA_UNSPLASH", "true"],
    ["KORA_MEDIA_UNSPLASH", "ON"],
    ["KORA_MEDIA_UNSPLASH", "1"],
  ];
  for (const [name, value] of bad)
    it(`${name}=${value} is rejected, names the variable and the accepted values, and does not echo the value`, () => {
      const e = issuesOf({ [name]: value });
      expect(e.issues.map((i) => i.variable)).toEqual([name]);
      for (const ok of FLAG_SYNTAX[name])
        expect(e.message).toContain(`"${ok}"`);
      expect(e.message).not.toContain(`=${value}`);
    });
  it("reports every bad variable at once, not just the first", () => {
    const e = issuesOf({
      KORA_MODEL_COMPOSE: "on",
      KORA_CREATIVE_ENGINE: "v9",
      KORA_MEDIA_UNSPLASH: "yes",
    });
    expect(e.issues.map((i) => i.variable).sort()).toEqual([
      "KORA_CREATIVE_ENGINE",
      "KORA_MEDIA_UNSPLASH",
      "KORA_MODEL_COMPOSE",
    ]);
  });
  it("never echoes the value of a malformed secret-bearing variable", () => {
    const e = issuesOf({
      INFERENCE_BASE_URL: "not a url sk-live-SECRETVALUE",
    });
    expect(e.message).toContain("INFERENCE_BASE_URL");
    expect(e.message).not.toContain("SECRETVALUE");
  });
});

describe("KORA_SECRETS_KEY is validated at startup, before the database is touched", () => {
  const good = Buffer.alloc(32, 7).toString("base64");
  it("accepts 32 random bytes in base64 and an unset key", () => {
    expect(load({ KORA_SECRETS_KEY: good }).KORA_SECRETS_KEY).toBe(good);
    expect(load({}).KORA_SECRETS_KEY).toBeUndefined();
  });
  it("rejects a key of the wrong length, naming the variable and never echoing it", () => {
    const short = Buffer.alloc(20, 9).toString("base64");
    const e = issuesOf({ KORA_SECRETS_KEY: short });
    expect(e.issues.map((i) => i.variable)).toEqual(["KORA_SECRETS_KEY"]);
    expect(e.message).toContain("32 random bytes");
    expect(e.message).not.toContain(short);
  });
});

describe("release warnings: a switch that would do nothing is visible", () => {
  const w = (env: Record<string, string>, llmConfigured = false) =>
    releaseWarnings({ NODE_ENV: "test", ...env }, load(env), { llmConfigured });
  it("is silent for the all-off defaults and for the documented staging values", () => {
    expect(w({})).toEqual([]);
    expect(
      w({
        KORA_CREATIVE_ENGINE: "v3",
        KORA_MEDIA_UNSPLASH: "off",
        KORA_MODEL_COMPOSE: "false",
        KORA_SECRETS_KEY: Buffer.alloc(32, 5).toString("base64"),
        KORA_PUBLIC_URL: "https://kora.example",
      }),
    ).toEqual([]);
  });
  it("flags Unsplash on without its key, app name and signing key", () => {
    const out = w({ KORA_MEDIA_UNSPLASH: "on" }).join("\n");
    expect(out).toContain("UNSPLASH_ACCESS_KEY");
    expect(out).toContain("UNSPLASH_APP_NAME");
    expect(out).toContain("KORA_SECRETS_KEY");
  });
  it("flags model composition with no AI provider, and not when one exists", () => {
    expect(w({ KORA_MODEL_COMPOSE: "true" }).join()).toContain(
      "no AI provider",
    );
    expect(w({ KORA_MODEL_COMPOSE: "true" }, true)).toEqual([]);
  });
  it("never contains the value of any secret", () => {
    const out = w({
      KORA_MEDIA_UNSPLASH: "on",
      UNSPLASH_ACCESS_KEY: "UNSPLASH-SECRET-123",
    }).join("\n");
    expect(out).not.toContain("UNSPLASH-SECRET-123");
  });
});

describe("the documentation cannot drift from the parser", () => {
  const re =
    /\b(KORA_CREATIVE_ENGINE|KORA_MEDIA_UNSPLASH|KORA_MODEL_COMPOSE|KORA_COPY_ASSIST)=([A-Za-z0-9_]+)/g;
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const n of readdirSync(dir)) {
      if (["node_modules", "dist", ".git", "logs", "test-results"].includes(n))
        continue;
      const p = join(dir, n);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(md|example|sh|yaml|yml|mjs)$/.test(n)) out.push(p);
    }
    return out;
  };
  it("every documented value of a release switch is a value the parser accepts", () => {
    const files = [
      ...walk(join(root, "docs")),
      join(root, "README.md"),
      join(root, ".env.example"),
      ...walk(join(root, "scripts")),
      ...walk(join(root, "deploy")),
    ];
    const wrong: string[] = [];
    let seen = 0;
    for (const f of files) {
      if (!existsSync(f)) continue;
      for (const m of readFileSync(f, "utf8").matchAll(re)) {
        seen++;
        const ok = FLAG_SYNTAX[
          m[1] as keyof typeof FLAG_SYNTAX
        ] as readonly string[];
        if (!ok.includes(m[2]!)) wrong.push(`${relative(root, f)}: ${m[0]}`);
      }
    }
    expect(seen).toBeGreaterThan(5);
    expect(wrong).toEqual([]);
  });
});

describe("startup", () => {
  const server = join(here, "../../dist/server.js");
  const run = (env: Record<string, string>) =>
    spawnSync("node", [server], {
      env: {
        PATH: process.env.PATH ?? "",
        // A database address nothing listens on: an invalid switch must stop the process before it ever connects.
        DATABASE_URL: "postgresql://nobody@127.0.0.1:1/never_test",
        API_PORT: "0",
        ...env,
      },
      encoding: "utf8",
      timeout: 20_000,
    });
  it("the built API exists (run `pnpm build` first)", () => {
    expect(existsSync(server)).toBe(true);
  });
  it("exits with EX_CONFIG (78) and a readable message for KORA_MODEL_COMPOSE=on, before touching the database", () => {
    const r = run({ KORA_MODEL_COMPOSE: "on", KORA_AUTO_MIGRATE: "true" });
    expect(r.status).toBe(78);
    expect(r.stderr).toContain("KORA_MODEL_COMPOSE");
    expect(r.stderr).toContain('"true" or "false"');
    expect(r.stderr).not.toMatch(/ECONNREFUSED|migration applied/);
  });
  it("exits 78 naming the variable (and not its value) for an invalid core setting", () => {
    const r = run({ MONITOR_INTERVAL_MS: "soon-SECRETISH" });
    expect(r.status).toBe(78);
    expect(r.stderr).toContain("MONITOR_INTERVAL_MS");
    expect(r.stderr).not.toContain("SECRETISH");
  });
  it("exits 78 for each other invalid switch", () => {
    for (const env of [
      { KORA_CREATIVE_ENGINE: "v9" },
      { KORA_MEDIA_UNSPLASH: "yes" },
    ]) {
      const r = run(env);
      expect(r.status).toBe(78);
      expect(r.stderr).toContain(Object.keys(env)[0]!);
    }
  });
});
