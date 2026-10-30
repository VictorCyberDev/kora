import type postgres from "postgres";
import { createHash } from "node:crypto";
import { stableStringify } from "@kora/site-schema";

type Row = Record<string, unknown>;
const iso = (v: unknown) =>
  v ? new Date(v as string | Date).toISOString() : null;
const str = (v: unknown): string | null =>
  v === null || v === undefined ? null : (v as string);

export type ChangeKind =
  | "VERSION_PUBLISHED"
  | "DEPLOYMENT_STARTED"
  | "DEPLOYMENT_COMPLETED"
  | "DEPLOYMENT_FAILED"
  | "DEPLOYMENT_REVISION_CHANGED"
  | "CONFIG_CHANGED"
  | "DOMAIN_STATUS_CHANGED"
  | "DATABASE_BINDING_CHANGED"
  | "PROVIDER_RESOURCE_STATE_CHANGED"
  | "APPLICATION_VERSION_CHANGED"
  | "ACTION_EXECUTED";

export const ACTION_STATES = [
  "PROPOSED",
  "POLICY_EVALUATED",
  "AWAITING_APPROVAL",
  "DENIED",
  "READY",
  "REJECTED",
  "EXPIRED",
  "EXECUTING",
  "EXECUTED",
  "EXECUTION_FAILED",
  "VERIFYING",
  "RECOVERY_VERIFIED",
  "RECOVERY_FAILED",
] as const;
export type ActionState = (typeof ACTION_STATES)[number];
/** Legal transitions; everything else is rejected by `transition`. */
const NEXT: Record<ActionState, ActionState[]> = {
  PROPOSED: ["POLICY_EVALUATED"],
  POLICY_EVALUATED: ["AWAITING_APPROVAL", "DENIED", "READY"],
  AWAITING_APPROVAL: ["READY", "REJECTED", "EXPIRED"],
  DENIED: [],
  REJECTED: [],
  EXPIRED: [],
  READY: ["EXECUTING"],
  EXECUTING: ["EXECUTED", "EXECUTION_FAILED"],
  EXECUTED: ["VERIFYING"],
  EXECUTION_FAILED: [],
  VERIFYING: ["RECOVERY_VERIFIED", "RECOVERY_FAILED"],
  RECOVERY_VERIFIED: [],
  RECOVERY_FAILED: [],
};
export const canTransition = (from: ActionState, to: ActionState) =>
  NEXT[from].includes(to);

export const mapAction = (r: Row) => ({
  id: String(r.id),
  orgId: str(r.org_id),
  siteId: str(r.site_id),
  incidentId: String(r.incident_id),
  serviceId: String(r.service_id),
  type: String(r.action_type),
  parameters: r.parameters as Record<string, unknown>,
  reason: String(r.reason),
  proposedBy: String(r.proposed_by),
  reasonerOutputId: str(r.reasoner_output_id),
  state: String(r.state) as ActionState,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});
export type ActionRecord = ReturnType<typeof mapAction>;

export class OpsStore {
  constructor(readonly sql: postgres.Sql) {}

  // ---- change intelligence ------------------------------------------------
  async recordChange(c: {
    orgId: string | null;
    siteId: string | null;
    serviceId: string | null;
    kind: ChangeKind;
    source: string;
    provider?: string | null;
    resourceId?: string | null;
    revision?: string | null;
    metadata?: Record<string, unknown>;
    provenance: string;
    occurredAt?: Date;
  }) {
    const id = crypto.randomUUID();
    await this
      .sql`INSERT INTO change_events(id,org_id,site_id,service_id,occurred_at,kind,source,provider,resource_id,revision,metadata,provenance)
      VALUES(${id},${c.orgId},${c.siteId},${c.serviceId},${(c.occurredAt ?? new Date()).toISOString()},${c.kind},${c.source},${c.provider ?? null},${c.resourceId ?? null},${c.revision ?? null},${this.sql.json((c.metadata ?? {}) as postgres.JSONValue)},${c.provenance})`;
    return id;
  }
  async listChanges(siteId: string, limit = 50) {
    return (
      await this
        .sql`SELECT * FROM change_events WHERE site_id=${siteId} ORDER BY occurred_at DESC,id LIMIT ${limit}`
    ).map((r) => ({
      id: String(r.id),
      kind: String(r.kind),
      occurredAt: iso(r.occurred_at)!,
      source: String(r.source),
      provider: str(r.provider),
      revision: str(r.revision),
      metadata: r.metadata as Record<string, unknown>,
      provenance: String(r.provenance),
      serviceId: str(r.service_id),
    }));
  }
  async recordDeployment(d: {
    orgId: string;
    siteId: string;
    serviceId: string | null;
    provider: string;
    resourceId: string | null;
    versionId: string;
    revision: string;
    artifactHash: string;
    status: "STARTED" | "COMPLETED" | "FAILED";
  }) {
    await this
      .sql`INSERT INTO deployment_revisions(id,org_id,site_id,service_id,provider,resource_id,version_id,revision,artifact_hash,status)
      VALUES(${crypto.randomUUID()},${d.orgId},${d.siteId},${d.serviceId},${d.provider},${d.resourceId},${d.versionId},${d.revision},${d.artifactHash},${d.status})`;
  }
  async listDeployments(siteId: string) {
    return (
      await this
        .sql`SELECT d.*,v.number AS version_number FROM deployment_revisions d LEFT JOIN site_versions v ON v.id=d.version_id WHERE d.site_id=${siteId} ORDER BY d.occurred_at DESC,d.id LIMIT 100`
    ).map((r) => ({
      id: String(r.id),
      provider: String(r.provider),
      versionId: str(r.version_id),
      versionNumber:
        r.version_number === null ? null : Number(r.version_number),
      revision: String(r.revision),
      artifactHash: str(r.artifact_hash),
      status: String(r.status),
      occurredAt: iso(r.occurred_at),
    }));
  }
  async setSiteBinding(b: {
    siteId: string;
    orgId: string;
    provider: string;
    publisher: string;
    workspace: string | null;
    resourceId: string | null;
    location: Record<string, unknown>;
    publicUrl: string;
  }) {
    await this
      .sql`INSERT INTO site_provider_bindings(site_id,org_id,provider,publisher,workspace,resource_id,location,public_url)
      VALUES(${b.siteId},${b.orgId},${b.provider},${b.publisher},${b.workspace},${b.resourceId},${this.sql.json(b.location as postgres.JSONValue)},${b.publicUrl})
      ON CONFLICT(site_id) DO UPDATE SET provider=EXCLUDED.provider,publisher=EXCLUDED.publisher,workspace=EXCLUDED.workspace,resource_id=EXCLUDED.resource_id,location=EXCLUDED.location,public_url=EXCLUDED.public_url,updated_at=now()`;
  }
  async getSiteBinding(siteId: string) {
    const r = (
      await this
        .sql`SELECT b.*,pr.provider_account,pr.region,pr.resource_type,pr.provider_resource_id FROM site_provider_bindings b LEFT JOIN provider_resources pr ON pr.id=b.resource_id WHERE b.site_id=${siteId}`
    )[0];
    return r
      ? {
          provider: String(r.provider),
          publisher: String(r.publisher),
          workspace: str(r.workspace),
          resourceId: str(r.resource_id),
          publicUrl: str(r.public_url),
          location: r.location as Record<string, unknown>,
          resource: r.resource_id
            ? {
                providerAccount: String(r.provider_account),
                region: String(r.region),
                resourceType: String(r.resource_type),
                providerResourceId: String(r.provider_resource_id),
              }
            : null,
        }
      : null;
  }
  async serviceForSite(siteId: string) {
    const r = (
      await this.sql`SELECT id FROM services WHERE site_id=${siteId}`
    )[0];
    return r ? String(r.id) : null;
  }
  async siteForService(serviceId: string) {
    const r = (
      await this
        .sql`SELECT s.id AS site_id,s.org_id,s.slug,s.name FROM services sv JOIN sites s ON s.id=sv.site_id WHERE sv.id=${serviceId}`
    )[0];
    return r
      ? {
          siteId: String(r.site_id),
          orgId: String(r.org_id),
          slug: String(r.slug),
          name: String(r.name),
        }
      : null;
  }
  async ensureSiteService(
    site: { id: string; orgId: string },
    name: string,
    healthUrl: string,
  ) {
    const r = (
      await this
        .sql`INSERT INTO services(id,name,health_url,site_id,org_id) VALUES(${crypto.randomUUID()},${name},${healthUrl},${site.id},${site.orgId})
        ON CONFLICT(name) DO UPDATE SET health_url=EXCLUDED.health_url,site_id=EXCLUDED.site_id,org_id=EXCLUDED.org_id RETURNING id`
    )[0]!;
    return String(r.id);
  }

  // ---- faults (controlled tests) -----------------------------------------
  async setFault(
    siteId: string,
    versionId: string,
    mode: string,
    userId: string,
  ) {
    await this
      .sql`INSERT INTO site_faults(site_id,version_id,mode,created_by) VALUES(${siteId},${versionId},${mode},${userId}) ON CONFLICT(site_id) DO UPDATE SET version_id=EXCLUDED.version_id,mode=EXCLUDED.mode,created_by=EXCLUDED.created_by,created_at=now()`;
  }
  async getFault(siteId: string) {
    const r = (
      await this
        .sql`SELECT version_id,mode FROM site_faults WHERE site_id=${siteId}`
    )[0];
    return r
      ? {
          versionId: String(r.version_id),
          mode: String(r.mode) as "http_500" | "timeout",
        }
      : null;
  }
  async clearFault(siteId: string) {
    await this.sql`DELETE FROM site_faults WHERE site_id=${siteId}`;
  }

  // ---- reasoner -----------------------------------------------------------
  async saveReasoning(r: {
    incidentId: string;
    snapshotId: string | null;
    source: string;
    model: string | null;
    output: unknown;
    rejectionReason: string | null;
    inputHash: string;
    inputTokens: number | null;
    outputTokens: number | null;
  }) {
    const id = crypto.randomUUID();
    await this
      .sql`INSERT INTO reasoner_outputs(id,incident_id,snapshot_id,source,model,output,rejection_reason,input_hash,input_tokens,output_tokens)
      VALUES(${id},${r.incidentId},${r.snapshotId},${r.source},${r.model},${this.sql.json(r.output as postgres.JSONValue)},${r.rejectionReason},${r.inputHash},${r.inputTokens},${r.outputTokens})`;
    return id;
  }
  async latestReasoning(incidentId: string) {
    const r = (
      await this
        .sql`SELECT * FROM reasoner_outputs WHERE incident_id=${incidentId} ORDER BY created_at DESC,id LIMIT 1`
    )[0];
    return r
      ? {
          id: String(r.id),
          source: String(r.source),
          model: str(r.model),
          output: r.output as unknown,
          rejectionReason: str(r.rejection_reason),
          inputHash: String(r.input_hash),
          createdAt: iso(r.created_at),
        }
      : null;
  }

  // ---- actions ------------------------------------------------------------
  static idempotencyKey(
    incidentId: string,
    type: string,
    parameters: unknown,
    generation: number,
  ) {
    return createHash("sha256")
      .update(
        `${incidentId}|${type}|${stableStringify(parameters)}|${generation}`,
      )
      .digest("hex");
  }
  async findLiveProposal(
    incidentId: string,
    type: string,
    parameters: unknown,
  ) {
    const rows = await this
      .sql`SELECT * FROM action_proposals WHERE incident_id=${incidentId} AND action_type=${type} AND state NOT IN ('DENIED','REJECTED','EXPIRED','EXECUTION_FAILED','RECOVERY_VERIFIED','RECOVERY_FAILED') AND NOT (action_type='run_health_check' AND state='EXECUTED') ORDER BY created_at DESC`;
    const key = stableStringify(parameters);
    const hit = rows.find((r) => stableStringify(r.parameters) === key);
    return hit ? mapAction(hit) : null;
  }
  async countProposals(incidentId: string, type: string, parameters: unknown) {
    const rows = await this
      .sql`SELECT parameters FROM action_proposals WHERE incident_id=${incidentId} AND action_type=${type}`;
    const key = stableStringify(parameters);
    return rows.filter((r) => stableStringify(r.parameters) === key).length;
  }
  async insertProposal(p: {
    orgId: string;
    siteId: string;
    incidentId: string;
    serviceId: string;
    type: string;
    parameters: Record<string, unknown>;
    reason: string;
    proposedBy: string;
    reasonerOutputId: string | null;
    idempotencyKey: string;
  }) {
    const id = crypto.randomUUID();
    const r = (
      await this
        .sql`INSERT INTO action_proposals(id,org_id,site_id,incident_id,service_id,action_type,parameters,reason,proposed_by,reasoner_output_id,idempotency_key,state)
      VALUES(${id},${p.orgId},${p.siteId},${p.incidentId},${p.serviceId},${p.type},${this.sql.json(p.parameters as postgres.JSONValue)},${p.reason},${p.proposedBy},${p.reasonerOutputId},${p.idempotencyKey},'PROPOSED') RETURNING *`
    )[0]!;
    return mapAction(r);
  }
  async getAction(id: string) {
    const r = (
      await this.sql`SELECT * FROM action_proposals WHERE id=${id}`
    )[0];
    return r ? mapAction(r) : null;
  }
  async listActions(incidentId: string) {
    return (
      await this
        .sql`SELECT * FROM action_proposals WHERE incident_id=${incidentId} ORDER BY created_at,id`
    ).map(mapAction);
  }
  async listActionsByState(states: ActionState[]) {
    return (
      await this
        .sql`SELECT * FROM action_proposals WHERE state IN ${this.sql(states)} ORDER BY created_at`
    ).map(mapAction);
  }
  /** Compare-and-swap: succeeds only if the row is still in `from` and the move is legal. */
  async transition(
    id: string,
    from: ActionState,
    to: ActionState,
  ): Promise<boolean> {
    if (!canTransition(from, to))
      throw new Error(`illegal action transition ${from} -> ${to}`);
    const r = await this
      .sql`UPDATE action_proposals SET state=${to},updated_at=now() WHERE id=${id} AND state=${from} RETURNING id`;
    return r.length === 1;
  }
  async savePolicyDecision(
    actionId: string,
    d: {
      decision: string;
      policyCode: string;
      reason: string;
      risk: string;
      input: unknown;
      expiresAt?: string | undefined;
    },
  ) {
    await this
      .sql`INSERT INTO policy_decisions(id,action_id,decision,policy_code,reason,risk,input,expires_at)
      VALUES(${crypto.randomUUID()},${actionId},${d.decision},${d.policyCode},${d.reason},${d.risk},${this.sql.json(d.input as postgres.JSONValue)},${d.expiresAt ?? null})`;
  }
  async latestPolicyDecision(actionId: string) {
    const r = (
      await this
        .sql`SELECT * FROM policy_decisions WHERE action_id=${actionId} ORDER BY decided_at DESC,id LIMIT 1`
    )[0];
    return r
      ? {
          decision: String(r.decision),
          policyCode: String(r.policy_code),
          reason: String(r.reason),
          risk: String(r.risk),
          expiresAt: iso(r.expires_at),
          decidedAt: iso(r.decided_at)!,
        }
      : null;
  }
  async saveApproval(
    actionId: string,
    decision: "APPROVED" | "REJECTED",
    userId: string,
    note: string | null,
  ) {
    const r = await this
      .sql`INSERT INTO action_approvals(id,action_id,decision,decided_by,note) VALUES(${crypto.randomUUID()},${actionId},${decision},${userId},${note}) ON CONFLICT(action_id) DO NOTHING RETURNING id`;
    return r.length === 1;
  }
  async getApproval(actionId: string) {
    const r = (
      await this.sql`SELECT * FROM action_approvals WHERE action_id=${actionId}`
    )[0];
    return r
      ? {
          decision: String(r.decision),
          decidedBy: String(r.decided_by),
          note: str(r.note),
          decidedAt: iso(r.decided_at)!,
        }
      : null;
  }
  async saveExecution(
    actionId: string,
    e: {
      executor: string;
      outcome: string;
      responseClass: string;
      trace: Record<string, unknown>;
      startedAt: Date;
      finishedAt: Date;
    },
  ) {
    const attempt = Number(
      (
        await this
          .sql`SELECT COALESCE(MAX(attempt),0)+1 AS n FROM action_executions WHERE action_id=${actionId}`
      )[0]!.n,
    );
    await this
      .sql`INSERT INTO action_executions(id,action_id,attempt,executor,outcome,response_class,trace,started_at,finished_at)
      VALUES(${crypto.randomUUID()},${actionId},${attempt},${e.executor},${e.outcome},${e.responseClass},${this.sql.json(e.trace as postgres.JSONValue)},${e.startedAt.toISOString()},${e.finishedAt.toISOString()})`;
    return attempt;
  }
  async listExecutions(actionId: string) {
    return (
      await this
        .sql`SELECT * FROM action_executions WHERE action_id=${actionId} ORDER BY attempt`
    ).map((r) => ({
      attempt: Number(r.attempt),
      executor: String(r.executor),
      outcome: String(r.outcome),
      responseClass: String(r.response_class),
      trace: r.trace as Record<string, unknown>,
      startedAt: iso(r.started_at)!,
      finishedAt: iso(r.finished_at)!,
    }));
  }
  async executionHistory(incidentId: string) {
    return (
      await this
        .sql`SELECT p.action_type AS type,e.outcome,e.finished_at AS at FROM action_executions e JOIN action_proposals p ON p.id=e.action_id WHERE p.incident_id=${incidentId} ORDER BY e.finished_at`
    ).map((r) => ({
      type: String(r.type),
      outcome: String(r.outcome),
      at: iso(r.at)!,
    }));
  }
  async saveVerification(v: {
    actionId: string;
    incidentId: string;
    outcome: "RECOVERY_VERIFIED" | "RECOVERY_FAILED";
    windowStartedAt: Date;
    decidedAt: Date;
    observationIds: string[];
    recoverySeconds: number | null;
    detail: Record<string, unknown>;
  }) {
    const r = await this
      .sql`INSERT INTO recovery_verifications(id,action_id,incident_id,outcome,window_started_at,decided_at,observation_ids,recovery_seconds,detail)
      VALUES(${crypto.randomUUID()},${v.actionId},${v.incidentId},${v.outcome},${v.windowStartedAt.toISOString()},${v.decidedAt.toISOString()},${this.sql.json(v.observationIds)},${v.recoverySeconds},${this.sql.json(v.detail as postgres.JSONValue)}) ON CONFLICT(action_id) DO NOTHING RETURNING id`;
    return r.length === 1;
  }
  async getVerification(actionId: string) {
    const r = (
      await this
        .sql`SELECT * FROM recovery_verifications WHERE action_id=${actionId}`
    )[0];
    return r
      ? {
          outcome: String(r.outcome),
          windowStartedAt: iso(r.window_started_at)!,
          decidedAt: iso(r.decided_at)!,
          observationIds: r.observation_ids as string[],
          recoverySeconds:
            r.recovery_seconds === null ? null : Number(r.recovery_seconds),
          detail: r.detail as Record<string, unknown>,
        }
      : null;
  }

  // ---- read models for Owner Mode ----------------------------------------
  async latestObservation(serviceId: string) {
    const r = (
      await this
        .sql`SELECT * FROM telemetry_observations WHERE service_id=${serviceId} ORDER BY observed_at DESC LIMIT 1`
    )[0];
    return r
      ? {
          healthy: Boolean(r.healthy),
          httpStatus: r.http_status === null ? null : Number(r.http_status),
          failureCategory: str(r.failure_category),
          observedAt: iso(r.observed_at)!,
          latencyMs: Number(r.latency_ms),
        }
      : null;
  }
  async uptime(serviceId: string, hours = 24) {
    const r = (
      await this
        .sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE healthy)::int AS ok FROM telemetry_observations WHERE service_id=${serviceId} AND observed_at > now() - ${hours} * interval '1 hour'`
    )[0]!;
    const total = Number(r.total);
    return {
      checks: total,
      healthy: Number(r.ok),
      percent:
        total === 0 ? null : Math.round((Number(r.ok) / total) * 10000) / 100,
    };
  }
  async incidentsForService(serviceId: string, limit = 20) {
    return (
      await this
        .sql`SELECT id,state,severity,started_at,resolved_at FROM incidents WHERE service_id=${serviceId} ORDER BY started_at DESC LIMIT ${limit}`
    ).map((r) => ({
      id: String(r.id),
      state: String(r.state),
      severity: String(r.severity),
      startedAt: iso(r.started_at)!,
      resolvedAt: iso(r.resolved_at),
    }));
  }
  async lastRecoveryAfter(incidentId: string, since: Date) {
    const r = (
      await this
        .sql`SELECT occurred_at,payload FROM domain_events WHERE correlation_id=${incidentId} AND event_type='RecoveryVerified' AND payload->>'actionId' IS NULL AND occurred_at >= ${since.toISOString()} ORDER BY occurred_at LIMIT 1`
    )[0];
    return r
      ? {
          occurredAt: iso(r.occurred_at)!,
          payload: r.payload as Record<string, unknown>,
        }
      : null;
  }
  async incidentRow(incidentId: string) {
    const r = (
      await this
        .sql`SELECT id,service_id,state,severity,started_at,resolved_at FROM incidents WHERE id=${incidentId}`
    )[0];
    return r
      ? {
          id: String(r.id),
          serviceId: String(r.service_id),
          state: String(r.state),
          severity: String(r.severity),
          startedAt: iso(r.started_at)!,
          resolvedAt: iso(r.resolved_at),
        }
      : null;
  }
  async domainsForSite(siteId: string) {
    return (
      await this
        .sql`SELECT id,hostname,state,dns_state,ssl_state FROM domains WHERE site_id=${siteId} ORDER BY created_at`
    ).map((r) => ({
      id: String(r.id),
      hostname: String(r.hostname),
      state: String(r.state),
      dnsState: String(r.dns_state),
      sslState: String(r.ssl_state),
    }));
  }
}
