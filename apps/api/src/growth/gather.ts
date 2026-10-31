import { parseAnySiteSpec } from "@kora/site-schema";
import {
  factsFromSpec,
  voiceFromMemory,
  type PresenceInputs,
} from "@kora/growth";
import type { PlatformStore } from "../platform/store.js";
import type { OpsStore } from "../platform/ops-store.js";
import type { GrowthStore } from "./store.js";
import { recentItems } from "./calendar-store.js";
import type { IntelStore } from "./intel-store.js";
import type { ChannelsStore } from "./channels-store.js";
import type { CustomersStore } from "./customers-store.js";

export interface GatherDeps {
  platform: PlatformStore;
  ops: OpsStore;
  growth: GrowthStore;
  channels: ChannelsStore;
  customers: CustomersStore;
  intel?: IntelStore;
  now: () => Date;
}
type Site = NonNullable<Awaited<ReturnType<PlatformStore["getSite"]>>>;

/** Everything the graph and the checks need, read fresh from the stores. */
export const createGatherer = (d: GatherDeps) => async (site: Site) => {
  const { platform, ops, growth, channels, customers, now } = d;
  const profile = await growth.getProfile(site.id);
  const rawKit = await growth.latestBrandKit(site.id);
  // The owner's remembered word preferences apply to everything written or checked from here on.
  const mem = d.intel
    ? voiceFromMemory(await d.intel.memory(site.id))
    : { avoid: [], use: [] };
  const kit =
    rawKit && (mem.avoid.length || mem.use.length)
      ? {
          ...rawKit,
          kit: {
            ...rawKit.kit,
            voice: {
              ...rawKit.kit.voice,
              avoid: [
                ...new Set([...rawKit.kit.voice.avoid, ...mem.avoid]),
              ].slice(0, 12),
              use: [...new Set([...rawKit.kit.voice.use, ...mem.use])].slice(
                0,
                12,
              ),
            },
          },
        }
      : rawKit;
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
  // One business, one truth: where does an ended offer still show up?
  const today = t.toISOString().slice(0, 10);
  const expired = profile
    ? profile.facts.offer.offers.filter(
        (o) => o.endsOn !== undefined && o.endsOn < today,
      )
    : [];
  const liveText = pubRow ? JSON.stringify(pubRow.spec).toLowerCase() : "";
  const queued = expired.length
    ? (
        await recentItems(
          platform.sql,
          site.id,
          new Date(t.getTime() - 120 * 86_400_000),
        )
      ).filter((r) =>
        ["APPROVAL_NEEDED", "APPROVED", "SCHEDULED"].includes(r.state),
      )
    : [];
  const inputs: PresenceInputs | null = profile
    ? {
        now: t,
        facts: profile.facts,
        staleness: {
          websiteMentions: expired
            .filter((o) => liveText.includes(o.title.toLowerCase()))
            .map((o) => o.title),
          scheduledPosts: queued.filter((r) =>
            expired.some((o) => r.text.includes(o.title.toLowerCase())),
          ).length,
        },
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
