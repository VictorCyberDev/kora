import {
  MAX_PUBLISH_ATTEMPTS,
  buildContentContext,
  buildPresenceGraph,
  checkPublishable,
  classifyFailure,
  contentHash,
  isBlocked,
  nextAttemptAt,
  type ChannelProvider,
} from "@kora/growth";
import type { PlatformStore } from "../platform/store.js";
import type { CalendarStore, JobRecord } from "./calendar-store.js";
import type { ChannelsStore } from "./channels-store.js";
import type { createGatherer } from "./gather.js";
import {
  ProviderError,
  type ProviderRegistry,
  type TokenSet,
} from "./providers.js";
import type { SecretBox } from "./secrets.js";
import type { StudioStore } from "./studio-store.js";

export interface PublishWorkerDeps {
  platform: PlatformStore;
  calendar: CalendarStore;
  channels: ChannelsStore;
  studio: StudioStore;
  providers: ProviderRegistry;
  secrets: SecretBox | null;
  gather: ReturnType<typeof createGatherer>;
  now: () => Date;
  log?: { warn: (o: object, m: string) => void };
}

/** Publishing engine: re-validate → publish → save external id → retry only safe failures → audit. The UI never calls a provider. */
export class PublishWorker {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  constructor(private readonly d: PublishWorkerDeps) {}

  /** Processes at most one due job. Returns whether one was processed. */
  async tick(): Promise<boolean> {
    await this.d.calendar.sweepStuck();
    const job = await this.d.calendar.claim(this.d.now());
    if (!job) return false;
    try {
      await this.run(job);
    } catch (e) {
      this.d.log?.warn(
        { jobId: job.id },
        `publish worker error: ${e instanceof Error ? e.message : "unknown"}`,
      );
      await this.d.calendar.fail(job, {
        message: "Kora could not complete this post.",
        cls: "UNCERTAIN",
      });
    }
    await this.settle(job);
    return true;
  }

  private async run(job: JobRecord) {
    const { calendar, channels, studio, providers, secrets, platform } = this.d;
    const item = await calendar.get(job.siteId, job.itemId);
    const site = await platform.getSite(job.siteId);
    if (!item || !site)
      return calendar.fail(job, {
        message: "The post no longer exists.",
        cls: "PERMANENT",
      });
    // The item moves to PUBLISHING on its first job; later jobs find it already there.
    if (item.state === "SCHEDULED")
      await calendar.transition(job.siteId, job.itemId, {
        type: "start_publish",
      });

    const g = await this.d.gather(site);
    if (!g.inputs || !g.kit)
      return calendar.fail(job, {
        message: "The business profile or Brand Kit is missing.",
        cls: "PERMANENT",
      });
    const graph = buildPresenceGraph(g.inputs);
    const ctx = buildContentContext(graph, g.kit.kit);
    const provider = job.provider as ChannelProvider;
    const conn = await channels.get(job.siteId, provider);
    const adapter = providers.adapter(provider);
    const hash = contentHash({
      caption: item.caption,
      assetId: item.assetId,
      channels: item.channels,
      scheduledFor: item.scheduledFor,
    });
    const assetMeta = item.assetId
      ? (await studio.listAssets(job.siteId)).find((a) => a.id === item.assetId)
      : null;
    const issues = checkPublishable({
      now: this.d.now(),
      channel: provider,
      connection: conn ? { state: conn.state, mode: conn.mode } : null,
      adapterCanPublish: typeof adapter?.publish === "function",
      caption: item.caption,
      asset: assetMeta ? { kind: assetMeta.kind, exists: true } : null,
      ctx,
      approval: {
        approved: item.approvedHash !== null,
        hashMatches: item.approvedHash === hash && job.contentHash === hash,
      },
      siteHasOpenIncident: g.inputs.operations.openIncidents > 0,
    });
    const block = issues.find((x) => x.severity === "block");
    if (block || !adapter?.publish || !secrets)
      return calendar.fail(job, {
        message: block?.message ?? "Posting is not available.",
        cls: "PERMANENT",
      });

    const sealed = await channels.sealedToken(job.siteId, provider);
    if (!sealed)
      return calendar.fail(job, {
        message: `${provider} needs to be reconnected.`,
        cls: "PERMANENT",
      });
    const tokens = secrets.open<TokenSet>(sealed);
    const file = item.assetId
      ? await studio.assetFile(job.siteId, item.assetId, "primary")
      : null;
    const text = [
      item.caption.headline,
      item.caption.body,
      item.caption.hashtags.join(" "),
    ]
      .filter(Boolean)
      .join("\n\n");
    try {
      const r = await adapter.publish(tokens, {
        text,
        media: file ? { bytes: file.bytes, mime: file.mime } : null,
        idempotencyKey: job.idempotencyKey,
      });
      await calendar.succeed(job, {
        externalId: r.externalId,
        url: r.url,
        method: adapter.mode,
      });
      await platform.audit({
        orgId: job.orgId,
        actorKind: "SYSTEM",
        action: "post.published",
        objectType: "publish_job",
        objectId: job.id,
        metadata: { provider, itemId: job.itemId, method: adapter.mode },
      });
    } catch (e) {
      const status = e instanceof ProviderError ? e.httpStatus : 0;
      const cls = classifyFailure(
        status === 0 ? { network: true } : { httpStatus: status },
      );
      const canRetry =
        cls === "RETRYABLE" && job.attempts < MAX_PUBLISH_ATTEMPTS;
      await calendar.fail(job, {
        message:
          e instanceof ProviderError
            ? `${provider} answered ${status || "with an error"}.`
            : "The request to the provider failed.",
        cls: cls === "RETRYABLE" && !canRetry ? "PERMANENT" : cls,
        httpStatus: status,
        ...(canRetry
          ? { retryAt: nextAttemptAt(job.attempts, this.d.now()) }
          : {}),
      });
      if (!canRetry)
        await platform.audit({
          orgId: job.orgId,
          actorKind: "SYSTEM",
          action: "post.failed",
          objectType: "publish_job",
          objectId: job.id,
          metadata: { provider, class: cls, status },
        });
    }
  }

  private async settle(job: JobRecord) {
    const s = await this.d.calendar.settled(job.itemId);
    if (s.open > 0) return;
    const item = await this.d.calendar.get(job.siteId, job.itemId);
    if (item?.state === "PUBLISHING")
      await this.d.calendar.transition(job.siteId, job.itemId, {
        type: "jobs_settled",
        published: s.published,
        failed: s.failed,
      });
  }

  start(everyMs = 5000) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.busy) return;
      this.busy = true;
      void (async () => {
        for (let i = 0; i < 10 && (await this.tick()); i++);
      })()
        .catch(() => undefined)
        .finally(() => (this.busy = false));
    }, everyMs);
    this.timer.unref();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
export { isBlocked };
