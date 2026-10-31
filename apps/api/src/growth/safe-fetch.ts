import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";

/** Is this address one a public audit must never connect to? */
export function isPrivateAddress(addr: string): boolean {
  if (net.isIPv6(addr)) {
    const a = addr.toLowerCase();
    if (a === "::1" || a === "::") return true;
    if (a.startsWith("fe80") || a.startsWith("fc") || a.startsWith("fd"))
      return true;
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
    return m ? isPrivateAddress(m[1]!) : false;
  }
  const p = addr.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n))) return true;
  const [a, b] = p as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export class UnsafeUrl extends Error {}

export interface SafeFetchOptions {
  allowPrivate?: boolean;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}
export interface SafeFetchResult {
  finalUrl: string;
  status: number;
  html: string;
  truncated: boolean;
}

export function validateTarget(raw: string, allowPrivate: boolean): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeUrl("That does not look like a web address.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:")
    throw new UnsafeUrl("Only http and https addresses can be checked.");
  if (u.username || u.password)
    throw new UnsafeUrl("Addresses with a login are not allowed.");
  if (!allowPrivate && u.port && u.port !== "80" && u.port !== "443")
    throw new UnsafeUrl("Only the standard web ports can be checked.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (
    !allowPrivate &&
    (host === "localhost" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      (net.isIP(host) && isPrivateAddress(host)))
  )
    throw new UnsafeUrl("That address is not a public website.");
  return u;
}

function once(
  u: URL,
  o: Required<SafeFetchOptions>,
): Promise<{
  status: number;
  location: string | null;
  body: string;
  truncated: boolean;
}> {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === "https:" ? https : http;
    const lookup: net.LookupFunction = (hostname, opts, cb) => {
      dns.lookup(hostname, { ...opts, all: true }, (err, addrs) => {
        if (err) return (cb as (e: Error) => void)(err);
        const list = addrs;
        const ok = o.allowPrivate
          ? list
          : list.filter((a) => !isPrivateAddress(a.address));
        if (ok.length === 0)
          return (cb as (e: Error) => void)(
            new UnsafeUrl("That address is not a public website."),
          );
        if ((opts as { all?: boolean }).all)
          return (cb as unknown as (e: null, a: dns.LookupAddress[]) => void)(
            null,
            ok,
          );
        return (cb as unknown as (e: null, a: string, f: number) => void)(
          null,
          ok[0]!.address,
          ok[0]!.family,
        );
      });
    };
    const req = mod.request(
      u,
      {
        method: "GET",
        lookup,
        timeout: o.timeoutMs,
        headers: {
          "user-agent": "KoraAudit/1.0 (+https://kora.example/audit)",
          accept: "text/html",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({
            status,
            location: String(res.headers.location),
            body: "",
            truncated: false,
          });
        }
        if (
          !/text\/html|application\/xhtml/i.test(
            String(res.headers["content-type"] ?? ""),
          )
        ) {
          res.resume();
          return reject(
            new UnsafeUrl("That address did not return a web page."),
          );
        }
        const chunks: Buffer[] = [];
        let n = 0;
        let truncated = false;
        res.on("data", (c: Buffer) => {
          n += c.length;
          if (n > o.maxBytes) {
            truncated = true;
            res.destroy();
            return;
          }
          chunks.push(c);
        });
        const end = () =>
          resolve({
            status,
            location: null,
            body: Buffer.concat(chunks).toString("utf8"),
            truncated,
          });
        res.on("end", end);
        res.on("close", end);
        res.on("error", reject);
      },
    );
    req.on("timeout", () =>
      req.destroy(new UnsafeUrl("The website took too long to answer.")),
    );
    req.on("error", reject);
    req.end();
  });
}

/** Fetches one public page. Every hop is re-validated, connections are pinned to validated addresses, size and time are capped. */
export async function safeFetchHtml(
  raw: string,
  opts: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const o: Required<SafeFetchOptions> = {
    allowPrivate: false,
    timeoutMs: 8000,
    maxBytes: 1_000_000,
    maxRedirects: 3,
    ...opts,
  };
  let u = validateTarget(raw, o.allowPrivate);
  for (let i = 0; i <= o.maxRedirects; i++) {
    const r = await once(u, o);
    if (r.location) {
      u = validateTarget(new URL(r.location, u).toString(), o.allowPrivate);
      continue;
    }
    return {
      finalUrl: u.toString(),
      status: r.status,
      html: r.body,
      truncated: r.truncated,
    };
  }
  throw new UnsafeUrl("The address redirects too many times.");
}
