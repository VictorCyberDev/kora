export type J = any;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: J,
  ) {
    super(message);
  }
}

export async function api<T = J>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      "x-requested-with": "kora",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: J = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok)
    throw new ApiError(
      res.status,
      json?.error ?? "error",
      json?.message ?? friendly(res.status),
      json,
    );
  return (
    json && typeof json === "object" && "data" in json ? json.data : json
  ) as T;
}
const friendly = (s: number) =>
  s === 401
    ? "Please sign in."
    : s === 403
      ? "You do not have permission to do that."
      : s === 404
        ? "We could not find that."
        : s === 429
          ? "Too many attempts. Please wait a minute."
          : "Something went wrong. Please try again.";

export const when = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
export const ago = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const s = Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / 1000),
  );
  if (s < 60) return `${s} seconds ago`;
  if (s < 3600) return `${Math.round(s / 60)} minutes ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`;
  return `${Math.round(s / 86400)} days ago`;
};
export const money = (minor: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
    minor / 100,
  );
