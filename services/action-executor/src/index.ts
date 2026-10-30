import { spawn } from "node:child_process";

export type ExecutionOutcome =
  | "SUCCEEDED"
  | "FAILED"
  | "UNSUPPORTED"
  | "REQUIRES_MANUAL_PROVIDER_ACTION"
  | "TIMED_OUT";
export interface ExecutionResult {
  outcome: ExecutionOutcome;
  /** Provider response classification; never raw provider output. */
  responseClass: string;
  trace: Record<string, unknown>;
}

const SECRET =
  /(rmp_[A-Za-z0-9_-]+|sk_(?:live|test)_[A-Za-z0-9]+|(?:token|api[_-]?key|secret|password)\s*[=:]\s*\S+)/gi;
export const redact = (s: string) => s.replace(SECRET, "[REDACTED]");

/** Identifiers that may be placed into an argument vector. */
const IDENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/;
export function assertIdent(value: string, what: string): string {
  if (!IDENT.test(value)) throw new Error(`invalid ${what}`);
  return value;
}

export interface RunOptions {
  timeoutMs: number;
  maxOutputBytes?: number;
  cwd?: string;
  env: Readonly<Record<string, string>>;
}
export interface RunOutput {
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}
/**
 * The only process-spawning primitive. `shell` is never enabled, arguments are
 * an array, the executable must be on the caller's allow-list, and the
 * environment is exactly what the caller passes (no inherited secrets).
 */
export function runProcess(
  executable: string,
  args: readonly string[],
  allowedExecutables: ReadonlySet<string>,
  options: RunOptions,
): Promise<RunOutput> {
  if (!allowedExecutables.has(executable))
    return Promise.reject(new Error("executable is not allow-listed"));
  for (const a of args)
    if (a.includes("\0")) return Promise.reject(new Error("invalid argument"));
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], {
      shell: false,
      cwd: options.cwd,
      env: { ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const cap = options.maxOutputBytes ?? 64 * 1024;
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);
    child.stdout.on("data", (d: Buffer) => {
      if (stdout.length < cap) stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d: Buffer) => {
      if (stderr.length < cap) stderr += d.toString("utf8");
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(redact(e.message)));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code,
        timedOut,
        stdout: redact(stdout.slice(0, cap)),
        stderr: redact(stderr.slice(0, cap)),
      });
    });
  });
}

export interface RumptyCliConfig {
  executable?: string;
  apiKey: string;
  workspace: string;
  timeoutMs?: number;
  extraAllowed?: ReadonlySet<string>;
}
/**
 * Documented Rumpty CLI surface only: `workspaces`, `vm ls`, and
 * `sync <folder> <bucket>[/prefix]`. The API key is passed through the
 * environment, never in argv and never stored. There is deliberately no `exec`,
 * `delete`, `reboot`, `stop` or `copy` wrapper: their argument syntax is not in
 * the published CLI reference, and Kora does not guess provider commands.
 */
export class RumptyCli {
  private readonly allowed: ReadonlySet<string>;
  constructor(private readonly cfg: RumptyCliConfig) {
    this.allowed = new Set([cfg.executable ?? "rumpty"]);
    assertIdent(cfg.workspace, "workspace");
  }
  private env(): Record<string, string> {
    return {
      PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
      HOME: process.env.HOME ?? "/tmp",
      RUMPTY_API_KEY: this.cfg.apiKey,
      RUMPTY_WORKSPACE: this.cfg.workspace,
    };
  }
  private run(args: string[], timeoutMs = this.cfg.timeoutMs ?? 120_000) {
    return runProcess(this.cfg.executable ?? "rumpty", args, this.allowed, {
      timeoutMs,
      env: this.env(),
    });
  }
  async listWorkspaces() {
    return this.run(["workspaces"], 30_000);
  }
  async listVms() {
    return this.run(["vm", "ls", "--ws", this.cfg.workspace], 30_000);
  }
  /** Mirrors `folder` into `bucket/prefix`. `--delete` is scoped to that prefix. */
  async syncFolder(
    folder: string,
    bucket: string,
    prefix: string,
    options: { public: boolean },
  ) {
    assertIdent(bucket, "bucket");
    assertIdent(prefix, "prefix");
    if (!folder.startsWith("/")) throw new Error("folder must be absolute");
    return this.run([
      "sync",
      folder,
      `${bucket}/${prefix}`,
      "--delete",
      ...(options.public ? ["--public"] : []),
      "--ws",
      this.cfg.workspace,
    ]);
  }
}

export function classifyProcess(out: RunOutput): ExecutionResult {
  if (out.timedOut)
    return {
      outcome: "TIMED_OUT",
      responseClass: "TIMEOUT",
      trace: { exitCode: out.exitCode },
    };
  if (out.exitCode === 0)
    return {
      outcome: "SUCCEEDED",
      responseClass: "EXIT_0",
      trace: { exitCode: 0, stdoutBytes: out.stdout.length },
    };
  const text = `${out.stderr} ${out.stdout}`;
  const responseClass = /401|403|unauthori[sz]ed|forbidden/i.test(text)
    ? "AUTHENTICATION_FAILED"
    : /429|rate.?limit/i.test(text)
      ? "RATE_LIMITED"
      : "NONZERO_EXIT";
  return {
    outcome: "FAILED",
    responseClass,
    trace: { exitCode: out.exitCode, stderr: out.stderr.slice(0, 500) },
  };
}
