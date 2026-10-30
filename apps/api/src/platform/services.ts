import type { FastifyBaseLogger } from "fastify";
import {
  finalizeForPublish,
  hashSpec,
  type SiteFiles,
  type SiteSpec,
} from "@kora/site-schema";
import type { EngineEffect, TelemetryObservation } from "@kora/incident-engine";
import type { KoraConfig } from "../config.js";
import { HealthMonitor } from "../monitor.js";
import type { KoraStore } from "../store.js";
import { redactSecrets } from "./security.js";
import { HttpError, notFound } from "./http.js";
import type { OpsStore } from "./ops-store.js";
import type { PlatformStore } from "./store.js";
import { KoraHostedPublisher, type SitePublisher } from "./publisher.js";

type Site = NonNullable<Awaited<ReturnType<PlatformStore["getSite"]>>>;
export type Actor = { userId: string | null; requestId?: string | undefined };

/** One HealthMonitor per published site, each with its own durable service and incident state. */
export class SiteMonitors {
  private readonly monitors = new Map<
    string,
    { monitor: HealthMonitor; url: string }
  >();
  private readonly pending = new Set<Promise<unknown>>();
  onEffect:
    | ((
        siteId: string,
        serviceId: string,
        effect: EngineEffect,
        o: TelemetryObservation,
      ) => Promise<void>)
    | null = null;
  constructor(
    private readonly d: {
      kora: KoraStore;
      ops: OpsStore;
      koraConfig: KoraConfig;
      log: FastifyBaseLogger;
      /** When false, monitors exist but only run on demand (tests). */
      autostart: boolean;
    },
  ) {}

  /** Creates the site's service and provider-resource binding; does not start a monitor. */
  async bind(
    site: Pick<Site, "id" | "orgId">,
    resource: ReturnType<SitePublisher["resourceFor"]>,
    environment: string,
    publicUrl: string,
    monitorUrl: string,
  ) {
    const serviceId = await this.d.ops.ensureSiteService(
      site,
      `site-${site.id}`,
      monitorUrl,
    );
    const stored = await this.d.kora.ensureProviderResource({
      ...resource,
      environment,
      metadata: { publicUrl, healthPath: "/" },
    });
    const resourceId = String(stored.id);
    await this.d.kora.bindServiceToResource(serviceId, resourceId);
    return { serviceId, resourceId };
  }

  start(
    site: Pick<Site, "id">,
    serviceId: string,
    resourceId: string,
    monitorUrl: string,
  ) {
    const existing = this.monitors.get(site.id);
    if (existing?.url === monitorUrl) return existing.monitor;
    void existing?.monitor.stop();
    const monitor = new HealthMonitor(
      { ...this.d.koraConfig, MONITOR_HEALTH_URL: monitorUrl },
      this.d.kora,
      this.d.log,
      serviceId,
      resourceId,
      null,
      (effect, observation) => {
        const task = Promise.resolve(
          this.onEffect?.(site.id, serviceId, effect, observation),
        ).catch((err) =>
          this.d.log.error({ err }, "site incident handler failed"),
        );
        this.pending.add(task);
        void task.finally(() => this.pending.delete(task));
      },
    );
    this.monitors.set(site.id, { monitor, url: monitorUrl });
    if (this.d.autostart) monitor.start();
    return monitor;
  }
  async checkNow(siteId: string) {
    const entry = this.monitors.get(siteId);
    if (!entry)
      throw new HttpError(
        409,
        "not_monitored",
        "This site is not being monitored yet.",
      );
    return entry.monitor.checkOnce();
  }
  /** Resolves when hook work triggered by monitor effects has finished (tests, shutdown). */
  async settle() {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }
  async stop(siteId: string) {
    const e = this.monitors.get(siteId);
    this.monitors.delete(siteId);
    await e?.monitor.stop();
  }
  async stopAll() {
    const all = [...this.monitors.values()];
    this.monitors.clear();
    await Promise.all(all.map((e) => e.monitor.stop()));
    await this.settle();
  }
  has(siteId: string) {
    return this.monitors.has(siteId);
  }
}

export class PublishService {
  private readonly locks = new Map<string, Promise<unknown>>();
  constructor(
    private readonly d: {
      kora: KoraStore;
      platform: PlatformStore;
      ops: OpsStore;
      publisher: SitePublisher;
      monitors: SiteMonitors;
      environment: string;
      monitorBase: string;
      log: FastifyBaseLogger;
    },
  ) {}

  monitorUrlFor(slug: string, publicUrl: string) {
    return this.d.publisher.name === "kora-hosted"
      ? `${this.d.monitorBase.replace(/\/+$/, "")}/s/${slug}/`
      : publicUrl;
  }

  /** Serialises publishes per site so two requests cannot interleave. */
  private async exclusive<T>(siteId: string, fn: () => Promise<T>): Promise<T> {
    const prior = this.locks.get(siteId) ?? Promise.resolve();
    const run = prior.catch(() => undefined).then(fn);
    this.locks.set(siteId, run);
    try {
      return await run;
    } finally {
      if (this.locks.get(siteId) === run) this.locks.delete(siteId);
    }
  }

  publish(site: Site, versionId: string, actor: Actor) {
    return this.exclusive(site.id, () =>
      this.publishNow(site, versionId, actor),
    );
  }

  private async publishNow(site: Site, versionId: string, actor: Actor) {
    const { platform, ops, kora, publisher, monitors } = this.d;
    const row = await platform.getVersionRow(site.id, versionId);
    if (!row) throw notFound();
    if (row.build_status !== "BUILT")
      throw new HttpError(409, "version_not_built");
    const published = await platform.getPublishedVersionRow(site.id);
    const number = Number(row.number);
    const kind =
      published?.id === row.id
        ? "REPUBLISH"
        : published && number < Number(published.number)
          ? "ROLLBACK"
          : "PUBLISH";
    const publicUrl = publisher.publicUrlFor(site.slug);
    const monitorUrl = this.monitorUrlFor(site.slug, publicUrl);
    const { serviceId, resourceId } = await monitors.bind(
      site,
      publisher.resourceFor(site),
      this.d.environment,
      publicUrl,
      monitorUrl,
    );
    const jobId = await platform.startPublishJob({
      siteId: site.id,
      orgId: site.orgId,
      versionId,
      publisher: publisher.name,
      kind,
      createdBy: actor.userId,
    });
    const revision = `v${number}`;
    await platform.markVersionPublishing(versionId);
    await platform.setSiteStatus(
      site.id,
      published ? "PUBLISHED" : "PUBLISHING",
    );
    await ops.recordDeployment({
      orgId: site.orgId,
      siteId: site.id,
      serviceId,
      provider: publisher.name,
      resourceId,
      versionId,
      revision,
      artifactHash: String(row.artifact_hash),
      status: "STARTED",
    });
    await ops.recordChange({
      orgId: site.orgId,
      siteId: site.id,
      serviceId,
      kind: "DEPLOYMENT_STARTED",
      source: "kora-publisher",
      provider: publisher.name,
      resourceId,
      revision,
      metadata: { versionId, kind },
      provenance: "kora:publish-service",
    });
    try {
      const spec = row.spec as SiteSpec;
      const finalized: SiteFiles = finalizeForPublish(
        row.artifact as SiteFiles,
        spec,
        publicUrl,
      );
      const out = await publisher.publish({
        site,
        version: { id: versionId, number },
        files: finalized,
      });
      await platform.markVersionPublished(site.id, versionId);
      await platform.setSiteStatus(site.id, "PUBLISHED", {
        publicUrl: out.publicUrl,
        publishedVersionId: versionId,
      });
      let verification = out.verification;
      if (
        publisher instanceof KoraHostedPublisher &&
        verification.status === "NOT_CHECKED"
      ) {
        verification = await publisher.verify(monitorUrl, finalized);
      }
      await platform.finishPublishJob(jobId, "SUCCEEDED", {
        deployedHash: out.deployedHash,
        location: out.location,
        verification,
        publicUrl: out.publicUrl,
      });
      await ops.setSiteBinding({
        siteId: site.id,
        orgId: site.orgId,
        provider: publisher.resourceFor(site).provider,
        publisher: publisher.name,
        workspace: publisher.resourceFor(site).providerAccount,
        resourceId,
        location: out.location,
        publicUrl: out.publicUrl,
      });
      await ops.recordDeployment({
        orgId: site.orgId,
        siteId: site.id,
        serviceId,
        provider: publisher.name,
        resourceId,
        versionId,
        revision,
        artifactHash: String(row.artifact_hash),
        status: "COMPLETED",
      });
      const meta = {
        versionId,
        versionNumber: number,
        kind,
        deployedHash: out.deployedHash,
        previousVersionId: published ? String(published.id) : null,
      };
      await ops.recordChange({
        orgId: site.orgId,
        siteId: site.id,
        serviceId,
        kind: "DEPLOYMENT_COMPLETED",
        source: "kora-publisher",
        provider: publisher.name,
        resourceId,
        revision,
        metadata: meta,
        provenance: "kora:publish-service",
      });
      await ops.recordChange({
        orgId: site.orgId,
        siteId: site.id,
        serviceId,
        kind: "VERSION_PUBLISHED",
        source: "kora-publisher",
        provider: publisher.name,
        resourceId,
        revision,
        metadata: meta,
        provenance: "kora:publish-service",
      });
      if (published && published.id !== row.id)
        await ops.recordChange({
          orgId: site.orgId,
          siteId: site.id,
          serviceId,
          kind: "DEPLOYMENT_REVISION_CHANGED",
          source: "kora-publisher",
          provider: publisher.name,
          resourceId,
          revision,
          metadata: { from: `v${Number(published.number)}`, to: revision },
          provenance: "kora:publish-service",
        });
      await kora.recordEvent({
        eventId: crypto.randomUUID(),
        eventType: "DeploymentObserved",
        schemaVersion: 1,
        occurredAt: new Date().toISOString(),
        source: "kora-publisher",
        serviceId,
        payload: {
          siteId: site.id,
          versionId,
          revision,
          provider: publisher.name,
          artifactHash: String(row.artifact_hash),
        },
      });
      await platform.recordUsage(site.orgId, site.id, "PUBLISH", 1, {
        kind,
        versionId,
      });
      await platform.audit({
        orgId: site.orgId,
        actorUserId: actor.userId,
        action: `site.${kind.toLowerCase()}`,
        objectType: "site_version",
        objectId: versionId,
        requestId: actor.requestId ?? null,
        metadata: {
          siteId: site.id,
          versionNumber: number,
          publisher: publisher.name,
        },
      });
      await platform.notify({
        orgId: site.orgId,
        siteId: site.id,
        kind: "SITE_PUBLISHED",
        title:
          kind === "ROLLBACK"
            ? "Previous version restored"
            : "Your website is published",
        body: `${site.name} is live at ${out.publicUrl}`,
        objectType: "site",
        objectId: site.id,
        dedupeKey: `publish:${jobId}`,
      });
      monitors.start(site, serviceId, resourceId, monitorUrl);
      return {
        jobId,
        kind,
        publicUrl: out.publicUrl,
        versionId,
        deployedHash: out.deployedHash,
        verification,
      };
    } catch (error) {
      const message = redactSecrets(
        error instanceof Error ? error.message : String(error),
      );
      await platform.markVersionPublishFailed(versionId);
      await platform.finishPublishJob(jobId, "FAILED", { error: message });
      await platform.setSiteStatus(site.id, published ? "PUBLISHED" : "FAILED");
      await ops.recordDeployment({
        orgId: site.orgId,
        siteId: site.id,
        serviceId,
        provider: publisher.name,
        resourceId,
        versionId,
        revision,
        artifactHash: String(row.artifact_hash),
        status: "FAILED",
      });
      await ops.recordChange({
        orgId: site.orgId,
        siteId: site.id,
        serviceId,
        kind: "DEPLOYMENT_FAILED",
        source: "kora-publisher",
        provider: publisher.name,
        resourceId,
        revision,
        metadata: { versionId, error: message },
        provenance: "kora:publish-service",
      });
      await platform.notify({
        orgId: site.orgId,
        siteId: site.id,
        kind: "PUBLISH_FAILED",
        title: "Publishing failed",
        body: `${site.name} could not be published. ${published ? "The previous version is still live." : ""}`,
        objectType: "site",
        objectId: site.id,
        dedupeKey: `publish-failed:${jobId}`,
      });
      await platform.audit({
        orgId: site.orgId,
        actorUserId: actor.userId,
        action: "site.publish_failed",
        objectType: "site_version",
        objectId: versionId,
        requestId: actor.requestId ?? null,
        metadata: { error: message },
      });
      throw new HttpError(502, "publish_failed", message);
    }
  }
}

export const specHashOf = (spec: unknown) => hashSpec(spec);
