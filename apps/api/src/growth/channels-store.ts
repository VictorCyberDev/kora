import { createHash, randomBytes } from "node:crypto";
import type postgres from "postgres";
import type { ChannelProvider, ConnectionState } from "@kora/growth";

type Row = Record<string, unknown>;
const iso = (v: unknown) =>
  v ? new Date(v as string | Date).toISOString() : null;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export interface ConnectionRecord {
  id: string;
  siteId: string;
  orgId: string;
  provider: ChannelProvider;
  state: ConnectionState;
  mode: "LIVE" | "SANDBOX";
  externalAccountId: string | null;
  accountName: string | null;
  scopes: string[];
  tokenExpiresAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
}
/** Never includes token material. */
const mapConn = (r: Row): ConnectionRecord => ({
  id: String(r.id),
  siteId: String(r.site_id),
  orgId: String(r.org_id),
  provider: r.provider as ChannelProvider,
  state: r.state as ConnectionState,
  mode: r.mode as "LIVE" | "SANDBOX",
  externalAccountId: (r.external_account_id as string | null) ?? null,
  accountName: (r.account_name as string | null) ?? null,
  scopes: (r.scopes as string[] | null) ?? [],
  tokenExpiresAt: iso(r.token_expires_at),
  lastCheckedAt: iso(r.last_checked_at),
  lastError: (r.last_error as string | null) ?? null,
});

export class ChannelsStore {
  constructor(private readonly sql: postgres.Sql) {}

  async list(siteId: string): Promise<ConnectionRecord[]> {
    return (
      await this
        .sql`SELECT * FROM channel_connections WHERE site_id=${siteId} ORDER BY provider`
    ).map(mapConn);
  }
  async get(siteId: string, provider: ChannelProvider) {
    const r = (
      await this
        .sql`SELECT * FROM channel_connections WHERE site_id=${siteId} AND provider=${provider}`
    )[0];
    return r ? mapConn(r) : null;
  }
  async sealedToken(
    siteId: string,
    provider: ChannelProvider,
  ): Promise<string | null> {
    const r = (
      await this
        .sql`SELECT token_ciphertext FROM channel_connections WHERE site_id=${siteId} AND provider=${provider}`
    )[0];
    return (r?.token_ciphertext as string | null) ?? null;
  }
  async byExternalAccount(provider: ChannelProvider, externalId: string) {
    const r = (
      await this
        .sql`SELECT * FROM channel_connections WHERE provider=${provider} AND external_account_id=${externalId} AND state <> 'DISCONNECTED'`
    )[0];
    return r ? mapConn(r) : null;
  }

  /** Starts an OAuth flow. Returns the raw state once; only its hash is stored. */
  async createState(i: {
    siteId: string;
    orgId: string;
    userId: string;
    provider: ChannelProvider;
    ttlMs?: number;
  }) {
    const state = randomBytes(32).toString("base64url");
    await this
      .sql`DELETE FROM oauth_states WHERE expires_at < now() - interval '1 day'`;
    await this
      .sql`INSERT INTO oauth_states(state_hash,site_id,org_id,user_id,provider,expires_at) VALUES(${sha(state)},${i.siteId},${i.orgId},${i.userId},${i.provider},${new Date(Date.now() + (i.ttlMs ?? 600_000)).toISOString()})`;
    return state;
  }
  /** Consumes a state exactly once. Returns null if unknown, used or expired. */
  async consumeState(state: string) {
    const r = (
      await this
        .sql`UPDATE oauth_states SET used_at=now() WHERE state_hash=${sha(state)} AND used_at IS NULL AND expires_at > now() RETURNING site_id,org_id,user_id,provider`
    )[0];
    return r
      ? {
          siteId: String(r.site_id),
          orgId: String(r.org_id),
          userId: String(r.user_id),
          provider: r.provider as ChannelProvider,
        }
      : null;
  }

  async upsert(i: {
    siteId: string;
    orgId: string;
    provider: ChannelProvider;
    state: ConnectionState;
    mode: "LIVE" | "SANDBOX";
    externalAccountId: string | null;
    accountName: string | null;
    scopes: string[];
    sealedToken: string;
    tokenExpiresAt: string | null;
    userId: string;
  }): Promise<ConnectionRecord> {
    const r = (
      await this
        .sql`INSERT INTO channel_connections(id,site_id,org_id,provider,state,mode,external_account_id,account_name,scopes,token_ciphertext,token_expires_at,last_checked_at,connected_by)
        VALUES(${crypto.randomUUID()},${i.siteId},${i.orgId},${i.provider},${i.state},${i.mode},${i.externalAccountId},${i.accountName},${i.scopes},${i.sealedToken},${i.tokenExpiresAt},now(),${i.userId})
        ON CONFLICT (site_id, provider) DO UPDATE SET state=EXCLUDED.state,mode=EXCLUDED.mode,external_account_id=EXCLUDED.external_account_id,account_name=EXCLUDED.account_name,scopes=EXCLUDED.scopes,token_ciphertext=EXCLUDED.token_ciphertext,token_expires_at=EXCLUDED.token_expires_at,last_checked_at=now(),last_error=NULL,connected_by=EXCLUDED.connected_by,updated_at=now()
        RETURNING *`
    )[0]!;
    return mapConn(r);
  }
  async setHealth(
    siteId: string,
    provider: ChannelProvider,
    h: {
      state: ConnectionState;
      lastError: string | null;
      sealedToken?: string;
      tokenExpiresAt?: string | null;
    },
  ) {
    await this
      .sql`UPDATE channel_connections SET state=${h.state},last_error=${h.lastError},last_checked_at=now(),updated_at=now(),
      token_ciphertext=COALESCE(${h.sealedToken ?? null},token_ciphertext),
      token_expires_at=CASE WHEN ${h.tokenExpiresAt !== undefined} THEN ${h.tokenExpiresAt ?? null}::timestamptz ELSE token_expires_at END
      WHERE site_id=${siteId} AND provider=${provider}`;
  }
  async disconnect(siteId: string, provider: ChannelProvider) {
    const r = await this
      .sql`UPDATE channel_connections SET state='DISCONNECTED',token_ciphertext=NULL,token_expires_at=NULL,external_account_id=NULL,last_error=NULL,updated_at=now() WHERE site_id=${siteId} AND provider=${provider} RETURNING id`;
    return r.length > 0;
  }

  /** Persists a webhook delivery. Returns false when this event was already received (replay). */
  async recordWebhook(i: {
    provider: string;
    eventId: string;
    payload: unknown;
    orgId?: string | null;
    siteId?: string | null;
  }) {
    const r = await this
      .sql`INSERT INTO webhook_events(id,provider,external_event_id,org_id,site_id,payload) VALUES(${crypto.randomUUID()},${i.provider},${i.eventId},${i.orgId ?? null},${i.siteId ?? null},${this.sql.json(i.payload as postgres.JSONValue)}) ON CONFLICT (provider, external_event_id) DO NOTHING RETURNING id`;
    return r[0] ? String(r[0].id) : null;
  }
  async finishWebhook(
    id: string,
    status: "PROCESSED" | "IGNORED" | "FAILED",
    detail?: string,
  ) {
    await this
      .sql`UPDATE webhook_events SET status=${status},detail=${detail ?? null},processed_at=now() WHERE id=${id}`;
  }
}
