import { promises as dns } from "node:dns";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { OpsStore } from "./ops-store.js";
import type { PlatformStore } from "./store.js";
import type { BillingService } from "./billing.js";
import { HttpError, notFound, requireOrgRole, requireUser } from "./http.js";

export type DomainState =
  | "REQUESTED"
  | "AWAITING_PAYMENT"
  | "REGISTERING"
  | "DNS_REQUIRED"
  | "VERIFYING"
  | "ACTIVE"
  | "FAILED";
export type DnsState =
  "UNKNOWN" | "MISCONFIGURED" | "POINTING_ELSEWHERE" | "CORRECT";
export type SslState = "UNKNOWN" | "PENDING" | "ACTIVE" | "FAILED";

const NEXT: Record<DomainState, DomainState[]> = {
  REQUESTED: ["AWAITING_PAYMENT", "DNS_REQUIRED", "FAILED"],
  AWAITING_PAYMENT: ["REGISTERING", "FAILED"],
  REGISTERING: ["DNS_REQUIRED", "FAILED"],
  DNS_REQUIRED: ["VERIFYING", "FAILED"],
  VERIFYING: ["ACTIVE", "DNS_REQUIRED", "FAILED"],
  ACTIVE: ["DNS_REQUIRED", "VERIFYING", "FAILED"],
  FAILED: ["DNS_REQUIRED", "REQUESTED"],
};
export const canMoveDomain = (from: DomainState, to: DomainState) =>
  from === to || NEXT[from].includes(to);

export class NotConfigured extends Error {
  constructor(
    readonly capability: string,
    message: string,
  ) {
    super(message);
    this.name = "NotConfigured";
  }
}
export interface DomainSearchResult {
  hostname: string;
  available: boolean;
  priceMinor: number | null;
  currency: string | null;
}
/** Registrar / DNS provider contract (Entri and Openprovider implement it when credentialed). */
export interface DomainProvider {
  readonly name: string;
  readonly configured: boolean;
  searchAvailability(query: string): Promise<DomainSearchResult[]>;
  suggest(query: string): Promise<DomainSearchResult[]>;
  /** Registration spends money: callers must hold an explicit, recorded approval. */
  purchase(
    hostname: string,
    approval: { approvedBy: string; approvedAt: string },
  ): Promise<{ registrarReference: string }>;
  renew(hostname: string): Promise<void>;
  status(
    hostname: string,
  ): Promise<{ registrarState: string; expiresAt: string | null }>;
}

const unconfigured = (name: string, reason: string): DomainProvider => {
  const fail = (capability: string) => () =>
    Promise.reject(new NotConfigured(capability, reason));
  return {
    name,
    configured: false,
    searchAvailability: fail("searchAvailability"),
    suggest: fail("suggest"),
    purchase: fail("purchase"),
    renew: fail("renew"),
    status: fail("status"),
  };
};
/** Registrar scaffolds: credentialed API calls need sandbox access that is not configured here. */
export const entriProvider = (applicationId?: string): DomainProvider =>
  unconfigured(
    "entri",
    applicationId
      ? "Entri credentials are present but the Entri flow has not been verified against their sandbox."
      : "ENTRI_APPLICATION_ID is not set.",
  );
export const openproviderProvider = (
  username?: string,
  password?: string,
): DomainProvider =>
  unconfigured(
    "openprovider",
    username && password
      ? "Openprovider credentials are present but the registrar flow has not been verified against their sandbox."
      : "OPENPROVIDER_USERNAME / OPENPROVIDER_PASSWORD are not set.",
  );

export interface DnsResolver {
  resolveCname(h: string): Promise<string[]>;
  resolve4(h: string): Promise<string[]>;
}
export const systemResolver: DnsResolver = {
  resolveCname: (h) => dns.resolveCname(h),
  resolve4: (h) => dns.resolve4(h),
};

/** What the owner must create at their DNS provider. */
export function requiredRecord(hostname: string, targetHost: string) {
  const labels = hostname.split(".");
  const apex = labels.length === 2;
  return apex
    ? {
        type: "A/ALIAS",
        name: "@",
        value: targetHost,
        note: "Apex domains cannot use a CNAME at most DNS hosts; use an ALIAS/ANAME record to this host, or the www name.",
      }
    : {
        type: "CNAME",
        name: labels[0]!,
        value: targetHost,
        note: "Create this record at your DNS provider.",
      };
}

export async function checkDns(
  resolver: DnsResolver,
  hostname: string,
  targetHost: string,
): Promise<{ dns: DnsState; detail: string }> {
  const target = targetHost.toLowerCase().replace(/\.$/, "");
  try {
    const cnames = (await resolver.resolveCname(hostname)).map((c) =>
      c.toLowerCase().replace(/\.$/, ""),
    );
    return cnames.includes(target)
      ? { dns: "CORRECT", detail: `CNAME points to ${target}` }
      : {
          dns: "POINTING_ELSEWHERE",
          detail: `CNAME points to ${cnames.join(", ")}`,
        };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "ENODATA" || code === "ENOTFOUND") {
      try {
        const [mine, theirs] = await Promise.all([
          resolver.resolve4(target),
          resolver.resolve4(hostname),
        ]);
        return theirs.some((a) => mine.includes(a))
          ? { dns: "CORRECT", detail: "A record matches the Kora host" }
          : {
              dns: "POINTING_ELSEWHERE",
              detail: `A record points to ${theirs.join(", ")}`,
            };
      } catch {
        return {
          dns: "MISCONFIGURED",
          detail: "no DNS record found for this name yet",
        };
      }
    }
    return { dns: "UNKNOWN", detail: "DNS lookup failed; try again shortly" };
  }
}

export interface DomainRow {
  id: string;
  orgId: string;
  siteId: string;
  hostname: string;
  flow: string;
  provider: string;
  state: DomainState;
  registrarState: string;
  dnsState: DnsState;
  sslState: SslState;
  target: string;
  lastVerifiedAt: string | null;
}
const mapDomain = (r: Record<string, unknown>): DomainRow => ({
  id: String(r.id),
  orgId: String(r.org_id),
  siteId: String(r.site_id),
  hostname: String(r.hostname),
  flow: String(r.flow),
  provider: String(r.provider),
  state: r.state as DomainState,
  registrarState: String(r.registrar_state),
  dnsState: r.dns_state as DnsState,
  sslState: r.ssl_state as SslState,
  target: String(r.target),
  lastVerifiedAt: r.last_verified_at
    ? new Date(r.last_verified_at as string).toISOString()
    : null,
});

export class DomainService {
  constructor(
    private readonly d: {
      platform: PlatformStore;
      ops: OpsStore;
      resolver: DnsResolver;
      targetHost: string;
      providers: DomainProvider[];
      fetchImpl?: typeof fetch;
    },
  ) {}
  providerStatus() {
    return this.d.providers.map((p) => ({
      name: p.name,
      configured: p.configured,
    }));
  }
  async list(siteId: string) {
    return (
      await this.d.platform
        .sql`SELECT * FROM domains WHERE site_id=${siteId} ORDER BY created_at`
    ).map(mapDomain);
  }
  async get(id: string) {
    const r = (
      await this.d.platform.sql`SELECT * FROM domains WHERE id=${id}`
    )[0];
    return r ? mapDomain(r) : null;
  }
  async byHostname(hostname: string) {
    const r = (
      await this.d.platform
        .sql`SELECT * FROM domains WHERE hostname=${hostname.toLowerCase()} AND state IN ('ACTIVE','VERIFYING')`
    )[0];
    return r ? mapDomain(r) : null;
  }
  private async event(
    domainId: string,
    kind: string,
    detail: Record<string, unknown>,
  ) {
    await this.d.platform
      .sql`INSERT INTO domain_status_events(id,domain_id,kind,detail) VALUES(${crypto.randomUUID()},${domainId},${kind},${this.d.platform.sql.json(detail as never)})`;
  }
  async connectExisting(
    site: { id: string; orgId: string },
    hostname: string,
    actorUserId: string,
  ) {
    const host = hostname.toLowerCase();
    try {
      const id = crypto.randomUUID();
      await this.d.platform
        .sql`INSERT INTO domains(id,org_id,site_id,hostname,flow,provider,state,target) VALUES(${id},${site.orgId},${site.id},${host},'CONNECT_EXISTING','manual-dns','DNS_REQUIRED',${this.d.targetHost})`;
      await this.event(id, "REQUESTED", { by: actorUserId });
      await this.d.platform.audit({
        orgId: site.orgId,
        actorUserId,
        action: "domain.connect_requested",
        objectType: "domain",
        objectId: id,
        metadata: { hostname: host },
      });
      return {
        domain: (await this.get(id))!,
        record: requiredRecord(host, this.d.targetHost),
      };
    } catch (e) {
      if ((e as { code?: string }).code === "23505")
        throw new HttpError(
          409,
          "domain_in_use",
          "That domain is already connected to a Kora site.",
        );
      throw e;
    }
  }
  /** Re-observes DNS and HTTPS and moves the state machine from what it sees. */
  async verify(domain: DomainRow) {
    const dnsResult = await checkDns(
      this.d.resolver,
      domain.hostname,
      domain.target,
    );
    let ssl: SslState = "UNKNOWN";
    let state: DomainState = domain.state;
    if (dnsResult.dns === "CORRECT") {
      try {
        const res = await (this.d.fetchImpl ?? fetch)(
          `https://${domain.hostname}/`,
          { signal: AbortSignal.timeout(6000), redirect: "manual" },
        );
        ssl = res.status < 500 ? "ACTIVE" : "FAILED";
      } catch {
        ssl = "PENDING";
      }
      state = ssl === "ACTIVE" ? "ACTIVE" : "VERIFYING";
    } else
      state =
        domain.state === "ACTIVE" || domain.state === "VERIFYING"
          ? "DNS_REQUIRED"
          : domain.state === "FAILED"
            ? "FAILED"
            : "DNS_REQUIRED";
    if (!canMoveDomain(domain.state, state)) state = domain.state;
    await this.d.platform
      .sql`UPDATE domains SET dns_state=${dnsResult.dns},ssl_state=${ssl},state=${state},last_verified_at=now(),updated_at=now() WHERE id=${domain.id}`;
    if (state !== domain.state) {
      await this.event(domain.id, "STATE_CHANGED", {
        from: domain.state,
        to: state,
        dns: dnsResult.dns,
        detail: dnsResult.detail,
      });
      const serviceId = await this.d.ops.serviceForSite(domain.siteId);
      await this.d.ops.recordChange({
        orgId: domain.orgId,
        siteId: domain.siteId,
        serviceId,
        kind: "DOMAIN_STATUS_CHANGED",
        source: "kora-domains",
        provider: "manual-dns",
        metadata: {
          hostname: domain.hostname,
          from: domain.state,
          to: state,
          dns: dnsResult.dns,
        },
        provenance: "kora:domain-verifier",
      });
      await this.d.platform.notify({
        orgId: domain.orgId,
        siteId: domain.siteId,
        kind: state === "ACTIVE" ? "DOMAIN_CONNECTED" : "DOMAIN_PROBLEM",
        title:
          state === "ACTIVE"
            ? `${domain.hostname} is connected`
            : `${domain.hostname} needs attention`,
        body:
          state === "ACTIVE" ? "DNS and HTTPS are working." : dnsResult.detail,
        objectType: "domain",
        objectId: domain.id,
        dedupeKey: `domain:${domain.id}:${state}:${Date.now() >> 16}`,
      });
    }
    return {
      domain: (await this.get(domain.id))!,
      detail: dnsResult.detail,
      record: requiredRecord(domain.hostname, domain.target),
    };
  }
  /** Periodic re-check so a broken record becomes a change event and a notification. */
  async recheckActive() {
    const rows = (
      await this.d.platform
        .sql`SELECT * FROM domains WHERE state IN ('ACTIVE','VERIFYING','DNS_REQUIRED')`
    ).map(mapDomain);
    for (const row of rows) await this.verify(row).catch(() => undefined);
    return rows.length;
  }
}

export function registerDomainRoutes(
  app: FastifyInstance,
  d: {
    domains: DomainService;
    platform: PlatformStore;
    billing: BillingService;
  },
) {
  const uuid = z.string().uuid();
  const siteFor = async (
    req: FastifyRequest,
    id: string,
    min: "VIEWER" | "ADMIN",
  ) => {
    const site = await d.platform.getSite(id);
    if (!site) throw notFound();
    requireOrgRole(req, site.orgId, min);
    return site;
  };
  app.get("/api/sites/:id/domains", async (req) => {
    const site = await siteFor(
      req,
      z.object({ id: uuid }).parse(req.params).id,
      "VIEWER",
    );
    const domains = await d.domains.list(site.id);
    return {
      data: {
        domains: domains.map((x) => ({
          ...x,
          record: requiredRecord(x.hostname, x.target),
        })),
        providers: d.domains.providerStatus(),
        purchase: {
          available: false,
          reason:
            "No domain registrar is configured. You can connect a domain you already own.",
        },
      },
    };
  });
  app.post("/api/sites/:id/domains/connect", async (req, reply) => {
    const site = await siteFor(
      req,
      z.object({ id: uuid }).parse(req.params).id,
      "ADMIN",
    );
    const { entitlements } = await d.billing.entitlements(site.orgId);
    if (!entitlements.canUseCustomDomain)
      throw new HttpError(
        402,
        "plan_restriction",
        entitlements.restrictedReason ??
          "Custom domains are not included in your plan.",
      );
    const body = z
      .object({ hostname: z.string().trim().toLowerCase().max(253) })
      .parse(req.body);
    if (
      !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
        body.hostname,
      )
    )
      throw new HttpError(
        422,
        "invalid_hostname",
        "Enter a domain like example.com or www.example.com.",
      );
    return reply.code(201).send({
      data: await d.domains.connectExisting(
        site,
        body.hostname,
        requireUser(req).userId,
      ),
    });
  });
  const notConfigured = async (
    req: FastifyRequest,
    fn: () => Promise<unknown>,
  ) => {
    try {
      return { data: await fn() };
    } catch (e) {
      if (e instanceof NotConfigured)
        throw new HttpError(
          501,
          "not_configured",
          `${e.message} Domain ${e.capability} is unavailable until a registrar is configured.`,
        );
      throw e;
    }
  };
  app.post("/api/sites/:id/domains/search", async (req) => {
    await siteFor(req, z.object({ id: uuid }).parse(req.params).id, "VIEWER");
    const q = z
      .object({ query: z.string().trim().min(2).max(63) })
      .parse(req.body).query;
    const provider = d.domains.providerStatus().find((p) => p.configured);
    if (!provider)
      throw new HttpError(
        501,
        "not_configured",
        "No domain registrar is configured, so Kora cannot search or sell domains yet.",
      );
    return notConfigured(req, () =>
      Promise.reject(
        new NotConfigured(
          "searchAvailability",
          `${q}: registrar integration is not verified.`,
        ),
      ),
    );
  });
  app.post("/api/sites/:id/domains/purchase", async (req) => {
    await siteFor(req, z.object({ id: uuid }).parse(req.params).id, "ADMIN");
    throw new HttpError(
      501,
      "not_configured",
      "Buying a domain is not available: no registrar is configured, and Kora never registers a domain without your explicit payment approval.",
    );
  });
  app.get("/api/domains/:id/status", async (req) => {
    const domain = await d.domains.get(
      z.object({ id: uuid }).parse(req.params).id,
    );
    if (!domain) throw notFound();
    requireOrgRole(req, domain.orgId, "VIEWER");
    return { data: await d.domains.verify(domain) };
  });
}
