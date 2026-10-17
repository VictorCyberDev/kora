export type FetchOutcome =
  | { ok: true; status: number; json: unknown }
  | { ok: false; reason: string; httpStatus: number | null };

const CODE = /^[A-Z][A-Z0-9_]+$/;

/** First stable error code in the cause chain, e.g. ECONNREFUSED. */
function errorCode(error: unknown, depth = 0): string | null {
  if (!error || typeof error !== "object" || depth > 6) return null;
  const e = error as { code?: unknown; cause?: unknown; errors?: unknown };
  if (typeof e.code === "string" && CODE.test(e.code)) return e.code;
  const nested: unknown[] = Array.isArray(e.errors)
    ? (e.errors as unknown[])
    : [];
  for (const inner of [e.cause, ...nested]) {
    const found = errorCode(inner, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * GET a JSON document without ever throwing. Failures come back as a short
 * fixed-vocabulary reason; response bodies, headers and error messages are
 * never copied into it, so nothing sent in a header (a token) or returned by
 * the remote end can end up in an observation or a log.
 */
export async function fetchJson(
  url: string,
  options: {
    timeoutMs: number;
    headers?: Record<string, string>;
    maxBytes?: number;
  },
): Promise<FetchOutcome> {
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      throw new Error("unsupported protocol");
  } catch {
    return { ok: false, reason: "invalid_url", httpStatus: null };
  }
  const maxBytes = options.maxBytes ?? 64 * 1024;
  try {
    const response = await fetch(parsed, {
      headers: options.headers ?? {},
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    if (response.status >= 300 && response.status < 400)
      return {
        ok: false,
        reason: "redirect_not_followed",
        httpStatus: response.status,
      };
    if (!response.ok)
      return {
        ok: false,
        reason: `http_status_${response.status}`,
        httpStatus: response.status,
      };
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return {
          ok: false,
          reason: "response_too_large",
          httpStatus: response.status,
        };
      }
      chunks.push(value);
    }
    try {
      const text = new TextDecoder().decode(Buffer.concat(chunks));
      return { ok: true, status: response.status, json: JSON.parse(text) };
    } catch {
      return { ok: false, reason: "invalid_json", httpStatus: response.status };
    }
  } catch (error) {
    if ((error as { name?: unknown } | null)?.name === "TimeoutError")
      return { ok: false, reason: "timeout", httpStatus: null };
    return {
      ok: false,
      reason: `unreachable: ${errorCode(error) ?? "UNKNOWN"}`,
      httpStatus: null,
    };
  }
}
