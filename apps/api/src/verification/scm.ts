import { z } from "zod";
import type { ConditionalCache } from "./conditional-cache.js";
import { fetchJson, publicUrl } from "./safe-fetch.js";

export interface ScmHeadObservation {
  kind: "scm_head";
  outcome: "OBSERVED" | "UNKNOWN";
  observedAt: string;
  sourceUrl: string;
  httpStatus: number | null;
  reason: string | null;
  sha: string | null;
}

/** How the claimed commit relates to the source head. */
export type CommitRelation =
  "identical" | "claimed_behind" | "claimed_ahead" | "diverged";

export interface RelationObservation {
  kind: "commit_relation";
  outcome: "OBSERVED" | "UNKNOWN";
  observedAt: string;
  sourceUrl: string;
  httpStatus: number | null;
  reason: string | null;
  relation: CommitRelation | null;
  /** Commits on the head that the claimed commit lacks. */
  behindBy: number | null;
  /** Commits on the claimed commit that the head lacks. */
  aheadBy: number | null;
}

type Common = {
  apiUrl: string;
  repo: string;
  token?: string | undefined;
  timeoutMs: number;
  now?: () => Date;
  /** Remembers ETags so unchanged answers come back as 304 (not rate limited). */
  cache?: ConditionalCache | undefined;
};

const SHA = /^[0-9a-f]{40}$/;
const headSchema = z.object({
  object: z.object({ sha: z.string().regex(SHA), type: z.literal("commit") }),
});
const compareSchema = z.object({
  status: z.enum(["identical", "ahead", "behind", "diverged"]),
  ahead_by: z.number().int().min(0),
  behind_by: z.number().int().min(0),
});

function headers(token: string | undefined): Record<string, string> {
  return {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "kora-deployment-verification",
    // The only place the token is used: one request header, nowhere else.
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}
const root = (apiUrl: string) => apiUrl.replace(/\/+$/, "");
const nowIso = (now?: () => Date) =>
  (now ?? (() => new Date()))().toISOString();

/**
 * One GET through the conditional cache. A 304 yields the previously
 * validated JSON with status 304; a 200 with a usable ETag refreshes the
 * cache; a payload that fails `schema` is never cached.
 */
async function conditionalGet<T>(
  url: string,
  schema: z.ZodType<T>,
  input: Common,
  extra: { maxBytes?: number } = {},
): Promise<
  | { ok: true; status: number; data: T }
  | { ok: false; httpStatus: number | null; reason: string }
> {
  const cached = input.cache?.get(url);
  const result = await fetchJson(url, {
    timeoutMs: input.timeoutMs,
    headers: headers(input.token),
    ...extra,
    ...(cached ? { etag: cached.etag } : {}),
  });
  if (!result.ok && result.notModified && cached) {
    const reused = schema.safeParse(cached.json);
    if (reused.success) return { ok: true, status: 304, data: reused.data };
    input.cache?.delete(url);
    return { ok: false, httpStatus: 304, reason: "invalid_payload" };
  }
  if (!result.ok)
    return { ok: false, httpStatus: result.httpStatus, reason: result.reason };
  const parsed = schema.safeParse(result.json);
  if (!parsed.success) {
    input.cache?.delete(url);
    return { ok: false, httpStatus: result.status, reason: "invalid_payload" };
  }
  if (input.cache) {
    if (result.etag) input.cache.set(url, result.etag, result.json);
    else input.cache.delete(url);
  }
  return { ok: true, status: result.status, data: parsed.data };
}

/** The branch head commit from GitHub's REST API. Never throws. */
export async function observeScmHead(
  input: Common & { branch: string },
): Promise<ScmHeadObservation> {
  const branch = input.branch.split("/").map(encodeURIComponent).join("/");
  const url = `${root(input.apiUrl)}/repos/${input.repo}/git/ref/heads/${branch}`;
  const base = {
    kind: "scm_head" as const,
    observedAt: nowIso(input.now),
    sourceUrl: publicUrl(url),
  };
  const result = await conditionalGet(url, headSchema, input);
  if (!result.ok)
    return {
      ...base,
      outcome: "UNKNOWN",
      httpStatus: result.httpStatus,
      reason: result.reason,
      sha: null,
    };
  return {
    ...base,
    outcome: "OBSERVED",
    httpStatus: result.status,
    reason: null,
    sha: result.data.object.sha,
  };
}

/**
 * GitHub's compare API for claimedCommit...headSha. If the call fails or the
 * payload is not understood the relation stays null: the commits only "differ".
 */
export async function observeCommitRelation(
  input: Common & { claimedCommit: string; headSha: string },
): Promise<RelationObservation> {
  const url = `${root(input.apiUrl)}/repos/${input.repo}/compare/${input.claimedCommit}...${input.headSha}?per_page=1`;
  const base = {
    kind: "commit_relation" as const,
    observedAt: nowIso(input.now),
    sourceUrl: publicUrl(url),
  };
  const unknown = (httpStatus: number | null, reason: string) => ({
    ...base,
    outcome: "UNKNOWN" as const,
    httpStatus,
    reason,
    relation: null,
    behindBy: null,
    aheadBy: null,
  });
  const result = await conditionalGet(url, compareSchema, input, {
    maxBytes: 512 * 1024,
  });
  if (!result.ok) return unknown(result.httpStatus, result.reason);
  const { status, ahead_by: headAhead, behind_by: headBehind } = result.data;
  let relation: CommitRelation;
  if (status === "identical") relation = "identical";
  else if (status === "ahead" && headAhead >= 1) relation = "claimed_behind";
  else if (status === "behind" && headBehind >= 1) relation = "claimed_ahead";
  else if (status === "diverged") relation = "diverged";
  else return unknown(result.status, "invalid_payload");
  return {
    ...base,
    outcome: "OBSERVED",
    httpStatus: result.status,
    reason: null,
    relation,
    behindBy: headAhead,
    aheadBy: headBehind,
  };
}
