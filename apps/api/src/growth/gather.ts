import { parseAnySiteSpec } from "@kora/site-schema";
import { factsFromSpec, type PresenceInputs } from "@kora/growth";
import type { PlatformStore } from "../platform/store.js";
import type { OpsStore } from "../platform/ops-store.js";
import type { GrowthStore } from "./store.js";
import type { ChannelsStore } from "./channels-store.js";
import type { CustomersStore } from "./customers-store.js";

export interface GatherDeps {
  platform: PlatformStore;
  ops: OpsStore;
  growth: GrowthStore;
  channels: ChannelsStore;
  customers: CustomersStore;
  now: () => Date;
}
type Site = NonNullable<Awaited<ReturnType<PlatformStore["getSite"]>>>;

/** Everything the graph and the checks need, read fresh from the stores. */
export const createGatherer = (d: GatherDeps) => async (site: Site) => {
  const { platform, ops, growth, channels, customers, now } = d;
  const profile = await growth.getProfile(site.id);
  const kit = await growth.latestBrandKit(site.id);
  const pubRow = await platform.getPublishedVersionRow(site.id);
  let liveFacts: PresenceInputs["site"]["liveFacts"] = null;
  if (pubRow) {
    try {
      liveFacts = factsFromSpec(parseAnySiteSpec(pubRow.spec));
    } catch {
      liveFacts = null;
    }
  }
  const domains = await ops.domainsForSite(site.id);
  const custom = domains.find((x) => x.state !== "DECOMMISSIONED") ?? null;
  const serviceId = await ops.serviceForSite(site.id);
  const obs = serviceId ? await ops.latestObservation(serviceId) : null;
  const incidents = serviceId
    ? await ops.incidentsForService(serviceId, 20)
    : [];
  const t = now();
  const inputs: PresenceInputs | null = profile
    ? {
        now: t,
        facts: profile.facts,
        site: {
          exists: true,
          published: site.status === "PUBLISHED",
          url: site.publicUrl,
          publishedAt: pubRow
            ? new Date(pubRow.published_at as string).toISOString()
            : null,
          liveFacts,
        },
        domain: {
          custom: custom?.hostname ?? null,
          verified: custom?.state === "ACTIVE",
          tls: custom
            ? custom.sslState === "ACTIVE"
              ? "valid"
              : "pending"
            : "unknown",
        },
        brand: kit ? { version: kit.version, kit: kit.kit } : null,
        channels: (await channels.list(site.id))
          .filter((c) => c.state !== "DISCONNECTED")
          .map((c) => ({
            provider: c.provider,
            state: c.state,
            account: c.accountName,
          })),
        proof: await growth.proofSummary(site.id),
        operations: {
          status: null,
          lastCheckAt: obs?.observedAt ?? null,
          openIncidents: incidents.filter((i) => i.resolvedAt === null).length,
        },
        demand: await (async () => {
          await customers.syncFormLeads(site.id, site.orgId);
          const c = await customers.counts(site.id, t);
          return {
            enquiries30d: (await growth.enquiryStats(site.id, t)).enquiries30d,
            waiting: c.waiting,
            oldestWaitingAt: c.oldestWaitingAt,
          };
        })(),
      }
    : null;
  return { profile, kit, inputs };
};
