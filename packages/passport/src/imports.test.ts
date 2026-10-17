import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { listImports, forbiddenImports } from "./test-support/imports.js";

const srcDir = dirname(fileURLToPath(import.meta.url));

describe("listImports", () => {
  it("finds static, side-effect, re-export, dynamic and require imports", () => {
    const source = `
      import a from "node:fs";
      import { b } from '../x.js';
      import type { T } from "pkg";
      import "side-effect";
      export * from "./re.js";
      export { c } from "re-pkg";
      const d = await import("dyn");
      const e = require("req");
    `;
    expect(listImports(source).sort()).toEqual(
      [
        "../x.js",
        "./re.js",
        "dyn",
        "node:fs",
        "pkg",
        "re-pkg",
        "req",
        "side-effect",
      ].sort(),
    );
  });
  it("flags dynamic imports whose target is not a literal", () => {
    expect(listImports("await import(name)")).toEqual(["<non-literal>"]);
  });
});

describe("forbiddenImports", () => {
  const builtins = new Set(builtinModules);
  it("flags apps/api, third-party packages and escapes from the package", () => {
    const bad = forbiddenImports(
      `import x from "../../../apps/api/src/app.js";
       import { z } from "zod";
       import "@kora/event-schema";
       import f from "fastify";
       import p from "postgres";`,
      "cli.ts",
      builtins,
    );
    expect(bad).toEqual([
      "../../../apps/api/src/app.js",
      "zod",
      "@kora/event-schema",
      "fastify",
      "postgres",
    ]);
  });
  it("allows node builtins, the passport package and local files", () => {
    expect(
      forbiddenImports(
        `import a from "node:fs"; import b from "fs"; import c from "@kora/passport"; import d from "./index.js";`,
        "cli.ts",
        builtins,
      ),
    ).toEqual([]);
  });
});

describe("the offline verifier", () => {
  // Entry point and everything it reaches inside this package.
  function reachable(entry: string): Map<string, string> {
    const seen = new Map<string, string>();
    const queue = [entry];
    while (queue.length) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      const source = readFileSync(file, "utf8");
      seen.set(file, source);
      for (const spec of listImports(source))
        if (spec.startsWith("."))
          queue.push(resolve(dirname(file), spec.replace(/\.js$/, ".ts")));
    }
    return seen;
  }

  it("imports only node builtins and packages/passport", () => {
    const files = reachable(resolve(srcDir, "cli.ts"));
    expect(
      [...files.keys()].map((f) => f.slice(srcDir.length + 1)).sort(),
    ).toEqual(expect.arrayContaining(["cli.ts", "index.ts", "verify-cli.ts"]));
    for (const [file, source] of files)
      expect(
        forbiddenImports(
          source,
          file.slice(srcDir.length + 1),
          new Set(builtinModules),
        ),
        file,
      ).toEqual([]);
  });

  it("keeps local imports inside packages/passport/src", () => {
    for (const file of reachable(resolve(srcDir, "cli.ts")).keys())
      expect(file.startsWith(srcDir + "/"), file).toBe(true);
  });
});
