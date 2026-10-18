#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { run } from "./verify-cli.js";

process.exitCode = run(process.argv.slice(2), {
  // pnpm runs root scripts from the repository root; INIT_CWD is where the
  // user typed the command, so relative paths mean what they look like.
  readFile: (path) =>
    readFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), path), "utf8"),
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
});
