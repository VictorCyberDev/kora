import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, normalize, sep } from "node:path";
import { RumptyCli, classifyProcess } from "@kora/action-executor";
import { artifactHash, sha256, type SiteFiles } from "@kora/site-schema";

export interface PublishInput {
  site: { id: string; slug: string; orgId: string };
  version: { id: string; number: number };
  /** Finalized files (sitemap/robots included) for this host. */
  files: SiteFiles;
}
export interface PublishOutput {
  publisher: string;
  publicUrl: string;
  /** Hash of the files handed to the host. */
  deployedHash: string;
  location: Record<string, unknown>;
  /** Result of fetching the live index and comparing it to the expected bytes. */
  verification: {
    status: "MATCH" | "MISMATCH" | "UNREACHABLE" | "NOT_CHECKED";
    detail: string;
  };
}
export class UnsupportedCapability extends Error {
  constructor(
    readonly capability: string,
    message: string,
  ) {
    super(message);
    this.name = "UnsupportedCapability";
  }
}

/** Provider-neutral publishing contract. */
export interface SitePublisher {
  readonly name: string;
  readonly capabilities: ReadonlySet<string>;
  /** Provider resource identity used to bind the site (Kora never invents one). */
  resourceFor(site: { id: string; slug: string }): {
    provider: string;
    providerAccount: string;
    region: string;
    resourceType: string;
    providerResourceId: string;
    displayName: string;
  };
  publicUrlFor(slug: string): string;
  publish(input: PublishInput): Promise<PublishOutput>;
  republish(input: PublishInput): Promise<PublishOutput>;
  unpublish(site: { id: string; slug: string }): Promise<void>;
  status(site: {
    slug: string;
  }): Promise<{ state: "LIVE" | "UNREACHABLE"; detail: string }>;
}

/** Rejects absolute paths, traversal and odd characters before any file is written. */
export function safeRelativePath(path: string): string {
  const n = normalize(path);
  if (
    n.startsWith(sep) ||
    n.split(sep).includes("..") ||
    !/^[A-Za-z0-9._/-]+$/.test(path) ||
    path.length > 120
  )
    throw new Error(`unsafe artifact path: ${path.slice(0, 40)}`);
  return n;
}

async function verifyLive(
  url: string,
  expectedIndex: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PublishOutput["verification"]> {
  try {
    const res = await fetchImpl(`${url}index.html`, {
      signal: AbortSignal.timeout(8000),
      headers: { "cache-control": "no-cache" },
    });
    if (!res.ok) return { status: "UNREACHABLE", detail: `HTTP ${res.status}` };
    const body = await res.text();
    return sha256(body) === sha256(expectedIndex)
      ? {
          status: "MATCH",
          detail: "live index.html matches the published artifact",
        }
      : {
          status: "MISMATCH",
          detail: "live index.html differs from the published artifact",
        };
  } catch {
    return { status: "UNREACHABLE", detail: "could not fetch the live site" };
  }
}

/**
 * Serves the immutable artifact straight from PostgreSQL at `/s/<slug>/`.
 * It shares a failure domain with the Kora API; the Rumpty bucket publisher is
 * the separated option.
 */
export class KoraHostedPublisher implements SitePublisher {
  readonly name = "kora-hosted";
  readonly capabilities = new Set([
    "PUBLISH",
    "REPUBLISH",
    "UNPUBLISH",
    "REPUBLISH_PREVIOUS_VERSION",
  ]);
  constructor(
    private readonly publicBase: string,
    private readonly environment: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}
  resourceFor(site: { id: string; slug: string }) {
    return {
      provider: "kora",
      providerAccount: "kora-hosted",
      region: this.environment,
      resourceType: "static_site",
      providerResourceId: site.id,
      displayName: site.slug,
    };
  }
  publicUrlFor(slug: string) {
    return `${this.publicBase.replace(/\/+$/, "")}/s/${slug}/`;
  }
  publish(input: PublishInput): Promise<PublishOutput> {
    for (const path of Object.keys(input.files)) safeRelativePath(path);
    const publicUrl = this.publicUrlFor(input.site.slug);
    return Promise.resolve({
      publisher: this.name,
      publicUrl,
      deployedHash: artifactHash(input.files),
      location: { hostedAt: `/s/${input.site.slug}/` },
      // Verification runs after the DB marks the version live (see PublishService).
      verification: {
        status: "NOT_CHECKED",
        detail: "checked after activation",
      },
    });
  }
  republish(input: PublishInput): Promise<PublishOutput> {
    return this.publish(input);
  }
  unpublish(): Promise<void> {
    // Serving is driven by the published-version pointer; nothing external to remove.
    return Promise.resolve();
  }
  async status(site: { slug: string }) {
    try {
      const res = await this.fetchImpl(this.publicUrlFor(site.slug), {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok
        ? { state: "LIVE" as const, detail: "HTTP 200" }
        : { state: "UNREACHABLE" as const, detail: `HTTP ${res.status}` };
    } catch {
      return { state: "UNREACHABLE" as const, detail: "request failed" };
    }
  }
  verify(publicUrl: string, files: SiteFiles) {
    return verifyLive(publicUrl, files["index.html"] ?? "", this.fetchImpl);
  }
}

export interface RumptyBucketConfig {
  apiKey: string;
  workspace: string;
  bucket: string;
  publicBaseUrl: string;
  region: string | undefined;
  executable?: string;
}
/**
 * Publishes with the documented `rumpty sync <folder> <bucket>/<slug> --public`.
 * The public URL shape of a bucket is not documented, so it is operator
 * configured (RUMPTY_SITE_PUBLIC_BASE_URL) and verified by fetching it.
 * Unpublishing is a manual provider action: no documented command deletes objects.
 */
export class RumptyBucketPublisher implements SitePublisher {
  readonly name = "rumpty-bucket";
  readonly capabilities = new Set([
    "PUBLISH",
    "REPUBLISH",
    "REPUBLISH_PREVIOUS_VERSION",
  ]);
  private readonly cli: RumptyCli;
  constructor(
    private readonly cfg: RumptyBucketConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.cli = new RumptyCli({
      apiKey: cfg.apiKey,
      workspace: cfg.workspace,
      ...(cfg.executable ? { executable: cfg.executable } : {}),
    });
  }
  resourceFor(site: { id: string; slug: string }) {
    return {
      provider: "rumptycloud",
      providerAccount: this.cfg.workspace,
      region: this.cfg.region ?? "unspecified",
      resourceType: "bucket",
      providerResourceId: `${this.cfg.bucket}/${site.slug}`,
      displayName: `${this.cfg.bucket}/${site.slug}`,
    };
  }
  publicUrlFor(slug: string) {
    return `${this.cfg.publicBaseUrl.replace(/\/+$/, "")}/${slug}/`;
  }
  async publish(input: PublishInput): Promise<PublishOutput> {
    const dir = await mkdtemp(join(tmpdir(), "kora-site-"));
    try {
      for (const [path, content] of Object.entries(input.files)) {
        const target = join(dir, safeRelativePath(path));
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content, "utf8");
      }
      const result = classifyProcess(
        await this.cli.syncFolder(dir, this.cfg.bucket, input.site.slug, {
          public: true,
        }),
      );
      if (result.outcome !== "SUCCEEDED")
        throw new Error(
          `rumpty sync ${result.outcome} (${result.responseClass})`,
        );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    const publicUrl = this.publicUrlFor(input.site.slug);
    return {
      publisher: this.name,
      publicUrl,
      deployedHash: artifactHash(input.files),
      location: { bucket: this.cfg.bucket, prefix: input.site.slug },
      verification: await verifyLive(
        publicUrl,
        input.files["index.html"] ?? "",
        this.fetchImpl,
      ),
    };
  }
  republish(input: PublishInput): Promise<PublishOutput> {
    return this.publish(input);
  }
  unpublish(): Promise<void> {
    return Promise.reject(
      new UnsupportedCapability(
        "UNPUBLISH",
        "Removing published objects is not available through a documented Rumpty command; remove the prefix in the Rumpty console.",
      ),
    );
  }
  async status(site: { slug: string }) {
    try {
      const res = await this.fetchImpl(this.publicUrlFor(site.slug), {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok
        ? { state: "LIVE" as const, detail: "HTTP 200" }
        : { state: "UNREACHABLE" as const, detail: `HTTP ${res.status}` };
    } catch {
      return { state: "UNREACHABLE" as const, detail: "request failed" };
    }
  }
}

/** Test double: records calls, optionally fails. */
export class FakePublisher implements SitePublisher {
  readonly name = "fake";
  readonly capabilities = new Set([
    "PUBLISH",
    "REPUBLISH",
    "REPUBLISH_PREVIOUS_VERSION",
  ]);
  calls: Array<{ kind: string; slug: string; version: number }> = [];
  failNext = false;
  constructor(private readonly base = "http://127.0.0.1:9") {}
  resourceFor(site: { id: string; slug: string }) {
    return {
      provider: "fake",
      providerAccount: "test",
      region: "test",
      resourceType: "static_site",
      providerResourceId: site.id,
      displayName: site.slug,
    };
  }
  publicUrlFor(slug: string) {
    return `${this.base}/${slug}/`;
  }
  publish(input: PublishInput): Promise<PublishOutput> {
    this.calls.push({
      kind: "publish",
      slug: input.site.slug,
      version: input.version.number,
    });
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error("fake publish failure"));
    }
    return Promise.resolve({
      publisher: this.name,
      publicUrl: this.publicUrlFor(input.site.slug),
      deployedHash: artifactHash(input.files),
      location: {},
      verification: { status: "NOT_CHECKED", detail: "fake" },
    });
  }
  republish(input: PublishInput): Promise<PublishOutput> {
    return this.publish(input);
  }
  unpublish(): Promise<void> {
    return Promise.resolve();
  }
  status(): Promise<{ state: "LIVE"; detail: string }> {
    return Promise.resolve({ state: "LIVE" as const, detail: "fake" });
  }
}
