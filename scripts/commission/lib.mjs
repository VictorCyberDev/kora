// Shared helpers for the local commissioning rehearsal. Everything here runs on this machine against a disposable
// database whose name ends in "_test"; nothing contacts a hosted service, a production database or a real provider.
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";

export const repo = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const require = createRequire(path.join(repo, "apps/api/package.json"));
export const postgres = require("postgres");

export const PG_ADMIN = process.env.COMMISSION_PG_ADMIN ?? "postgresql://postgres@localhost:55432/postgres";
export const DB_NAME = "kora_commission_test";
export const DB_URL = PG_ADMIN.replace(/\/[^/]*$/, `/${DB_NAME}`);

export function recorder(outDir) {
  const steps = [];
  let phase = "";
  const log = fs.createWriteStream(path.join(outDir, "commissioning.log"), { flags: "a" });
  return {
    steps,
    setPhase(p) {
      phase = p;
      const l = `\n=== ${p} ===`;
      console.log(l);
      log.write(l + "\n");
    },
    /** kind: "real" = a real local service and real HTTP; "mock" = an external provider replaced by a local fake (simulated). */
    step(name, ok, detail = "", kind = "real") {
      steps.push({ phase, name, ok: !!ok, detail: String(detail).slice(0, 400), kind, at: new Date().toISOString() });
      const l = `${ok ? "PASS" : "FAIL"} [${kind}] ${name}${detail ? "  " + String(detail).slice(0, 240) : ""}`;
      console.log(l);
      log.write(l + "\n");
      return !!ok;
    },
    close: () => log.end(),
  };
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export async function until(fn, tries = 60, ms = 500) {
  for (let i = 0; i < tries; i++) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      /* not yet */
    }
    await wait(ms);
  }
  return null;
}

export async function resetDatabase() {
  const admin = postgres(PG_ADMIN, { max: 1 });
  await admin.unsafe(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE ${DB_NAME}`);
  await admin.end();
}

/** A child process with its output captured to a file. */
export function startProc(outDir, name, args, env, cwd) {
  const file = path.join(outDir, `${name}.log`);
  const out = fs.openSync(file, "a");
  const child = spawn("node", args, { cwd, env: { PATH: process.env.PATH, ...env }, stdio: ["ignore", out, out] });
  const proc = { name, child, file, exited: null };
  child.on("exit", (code, sig) => (proc.exited = { code, sig }));
  return proc;
}
export async function stopProc(p) {
  if (!p || p.exited) return;
  p.child.kill("SIGTERM");
  await until(() => p.exited, 40, 250);
  if (!p.exited) p.child.kill("SIGKILL");
}
export const logText = (p) => (fs.existsSync(p.file) ? fs.readFileSync(p.file, "utf8") : "");

export async function health(url) {
  const r = await fetch(url + "/health").catch(() => null);
  return r?.ok ? r.json().catch(() => ({})) : null;
}

/** Minimal cookie-aware HTTP client for the Kora API. */
export function client(base) {
  let cookie = "";
  const call = async (method, p, body, o = {}) => {
    const isBin = body instanceof Uint8Array;
    const res = await fetch(base + p, {
      method,
      redirect: "manual",
      headers: {
        "x-requested-with": "kora",
        ...(body !== undefined && !isBin ? { "content-type": "application/json" } : {}),
        ...(isBin ? { "content-type": o.type ?? "application/octet-stream" } : {}),
        ...(cookie && !o.anonymous ? { cookie } : {}),
        ...(o.headers ?? {}),
      },
      ...(body !== undefined ? { body: isBin ? body : JSON.stringify(body) } : {}),
    });
    const sc = res.headers.get("set-cookie");
    if (sc && !o.anonymous) cookie = sc.split(";")[0];
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: res.status, json, text, headers: res.headers };
  };
  return { call, getCookie: () => cookie, setCookie: (c) => (cookie = c) };
}

/** A deterministic test PNG (no dependency), used as an "owner photo". */
import { deflateSync, crc32 } from "node:zlib";
export function png(w, h, seed = 1) {
  let s = seed >>> 0;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const bs = 12, bw = Math.ceil(w / bs), bh = Math.ceil(h / bs);
  const cells = Array.from({ length: bw * bh }, () => [(40 + rnd() * 180) | 0, (40 + rnd() * 150) | 0, (40 + rnd() * 120) | 0]);
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const c = cells[((y / bs) | 0) * bw + ((x / bs) | 0)];
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
    }
  }
  const chunk = (type, data) => {
    const t = Buffer.from(type), len = Buffer.alloc(4), crc = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

/** A local fake of an external HTTP provider. `handler(req)` returns { status?, body, headers? }. Clearly a simulation. */
export function fakeServer(handler) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const r = { method: req.method, url: req.url, body: raw, headers: req.headers };
    requests.push(r);
    let out;
    try {
      out = await handler(r);
    } catch (e) {
      out = { status: 500, body: { error: "fake provider handler failed", message: String(e.message) } };
    }
    res.writeHead(out.status ?? 200, { "content-type": "application/json", ...(out.headers ?? {}) });
    res.end(typeof out.body === "string" ? out.body : JSON.stringify(out.body));
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        requests,
        close: () => new Promise((r) => server.close(r)),
        server,
      }),
    ),
  );
}
