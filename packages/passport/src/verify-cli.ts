import { verifyPassport } from "./index.js";

export interface CliIo {
  readFile(path: string): string;
  out(line: string): void;
  err(line: string): void;
}

/** Returns the process exit code: 0 PASS, 1 FAIL, 2 usage error. */
export function run(args: string[], io: CliIo): number {
  if (args.length !== 1) {
    io.err("usage: pnpm kora:verify <passport.json>");
    return 2;
  }
  const file = args[0]!;
  let text: string;
  try {
    text = io.readFile(file);
  } catch (error) {
    io.out(`FAIL ${file}: cannot read file (${String(error)})`);
    return 1;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    io.out(`FAIL ${file}: not valid JSON (${String(error)})`);
    return 1;
  }
  const result = verifyPassport(parsed);
  if (!result.ok) {
    io.out(`FAIL ${file}: ${result.reason}`);
    for (const c of result.checks.filter((c) => !c.ok).slice(1))
      io.out(`  also failed, ${c.name}: ${c.detail}`);
    return 1;
  }
  io.out(`PASS ${file}`);
  for (const c of result.checks) io.out(`  ${c.name.padEnd(26)}${c.detail}`);
  io.out(
    "Integrity only: PASS shows this file has not changed since its hash was computed.",
  );
  io.out(
    "The Passport is not signed, so PASS does not show who produced it. Signing is future work.",
  );
  return 0;
}
