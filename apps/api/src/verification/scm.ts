import { z } from "zod";
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
  const result = await fetchJson(url, {
    timeoutMs: input.timeoutMs,
    headers: headers(input.token),
  });
  if (!result.ok)
    return {
      ...base,
      outcome: "UNKNOWN",
      httpStatus: result.httpStatus,
      reason: result.reason,
      sha: null,
    };
  const parsed = headSchema.safeParse(result.json);
  if (!parsed.success)
    return {
      ...base,
      outcome: "UNKNOWN",
      httpStatus: result.status,
      reason: "invalid_payload",
      sha: null,
    };
  return {
    ...base,
    outcome: "OBSERVED",
    httpStatus: result.status,
    reason: null,
    sha: parsed.data.object.sha,
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
  const result = await fetchJson(url, {
    timeoutMs: input.timeoutMs,
    headers: headers(input.token),
    maxBytes: 512 * 1024,
  });
  if (!result.ok) return unknown(result.httpStatus, result.reason);
  const parsed = compareSchema.safeParse(result.json);
  if (!parsed.success) return unknown(result.status, "invalid_payload");
  const { status, ahead_by: headAhead, behind_by: headBehind } = parsed.data;
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
