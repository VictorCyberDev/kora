#!/usr/bin/env node
import { readFileSync } from "node:fs";
import process from "node:process";
import { run } from "./verify-cli.js";

process.exitCode = run(process.argv.slice(2), {
  readFile: (path) => readFileSync(path, "utf8"),
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
});
