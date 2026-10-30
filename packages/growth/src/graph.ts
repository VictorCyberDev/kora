import type { BrandKit } from "./brand.js";
import type { BusinessFacts } from "./facts.js";

export const CHANNEL_PROVIDERS = [
  "instagram",
  "facebook",
  "whatsapp",
  "google_business",
  "search_console",
  "tiktok",
  "linkedin",
] as const;
export type ChannelProvider = (typeof CHANNEL_PROVIDERS)[number];

export const CONNECTION_STATES = [
  "CONNECTED",
  "AUTH_EXPIRED",
  "PERMISSION_REQUIRED",
  "RATE_LIMITED",
  "DEGRADED",
  "DISCONNECTED",
  "NOT_SUPPORTED",
] as const;
export type ConnectionState = (typeof CONNECTION_STATES)[number];

/** Everything the presence layer needs to know, gathered by the API from the stores. Pure data in, pure data out. */
export interface PresenceInputs {
  now: Date;
  facts: BusinessFacts;
  site: {
    exists: boolean;
    published: boolean;
    url: string | null;
    publishedAt: string | null;
    /** Facts as read from the live published spec, for drift detection. */
    liveFacts: BusinessFacts | null;
  };
  domain: {
    custom: string | null;
    verified: boolean;
    tls: "valid" | "pending" | "unknown";
  };
  brand: { version: number; kit: BrandKit } | null;
  channels: Array<{
    provider: ChannelProvider;
    state: ConnectionState;
    account: string | null;
  }>;
  proof: { passports: number; lastPassportAt: string | null };
  operations: {
    status: string | null;
    lastCheckAt: string | null;
    openIncidents: number;
  };
  demand: {
    enquiries30d: number;
    waiting: number;
    oldestWaitingAt: string | null;
  };
}

export type FactOrigin = "owner" | "site" | "observed" | "unavailable";
export interface GraphNode<T> {
  value: T;
  origin: FactOrigin;
}

/** The Presence Graph: one factual model of the business that every surface reads from. */
export interface PresenceGraph {
  generatedAt: string;
  identity: BusinessFacts["identity"];
  contact: BusinessFacts["contact"] & { reachable: boolean };
  availability: BusinessFacts["availability"] & { stated: boolean };
  offer: {
    services: string[];
    activeOffers: BusinessFacts["offer"]["offers"];
    expiredOffers: BusinessFacts["offer"]["offers"];
  };
  brand: { version: number | null; kit: BrandKit | null };
  distribution: {
    website: { published: boolean; url: string | null };
    domain: PresenceInputs["domain"];
    channels: Array<{
      provider: ChannelProvider;
      state: ConnectionState | "NOT_CONNECTED";
      account: string | null;
    }>;
    statedHandles: BusinessFacts["social"];
  };
  proof: PresenceInputs["proof"];
  operations: PresenceInputs["operations"];
  /** Demand is `null` (unavailable) when no data source feeds it — never zero-by-default. */
  demand: PresenceInputs["demand"];
}

const todayIso = (d: Date) => d.toISOString().slice(0, 10);

export function isExpired(
  o: { endsOn?: string | undefined },
  now: Date,
): boolean {
  return o.endsOn !== undefined && o.endsOn < todayIso(now);
}

export function buildPresenceGraph(i: PresenceInputs): PresenceGraph {
  const f = i.facts;
  const active = f.offer.offers.filter((o) => !isExpired(o, i.now));
  const expired = f.offer.offers.filter((o) => isExpired(o, i.now));
  return {
    generatedAt: i.now.toISOString(),
    identity: f.identity,
    contact: {
      ...f.contact,
      reachable: Boolean(
        f.contact.phone || f.contact.whatsapp || f.contact.email,
      ),
    },
    availability: {
      ...f.availability,
      stated: f.availability.hours.length > 0,
    },
    offer: {
      services: f.offer.services,
      activeOffers: active,
      expiredOffers: expired,
    },
    brand: i.brand
      ? { version: i.brand.version, kit: i.brand.kit }
      : { version: null, kit: null },
    distribution: {
      website: { published: i.site.published, url: i.site.url },
      domain: i.domain,
      channels: CHANNEL_PROVIDERS.map((p) => {
        const c = i.channels.find((x) => x.provider === p);
        return c
          ? { provider: p, state: c.state, account: c.account }
          : { provider: p, state: "NOT_CONNECTED" as const, account: null };
      }),
      statedHandles: f.social,
    },
    proof: i.proof,
    operations: i.operations,
    demand: i.demand,
  };
}
