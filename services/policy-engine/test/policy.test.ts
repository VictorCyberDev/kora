import { describe, expect, it } from "vitest";
import { evaluatePolicy, type PolicyInput } from "../src/index.js";

const V1 = "11111111-1111-4111-8111-111111111111";
const V2 = "22222222-2222-4222-8222-222222222222";
const base = (over: Partial<PolicyInput> = {}): PolicyInput => ({
  orgId: "o",
  siteId: "s",
  incident: { id: "i", severity: "HIGH" },
  action: { type: "run_health_check", parameters: {} },
  target: {
    providerResourceId: "r",
    identityComplete: true,
    capabilities: new Set(["REPUBLISH"]),
    publishedVersionId: V2,
  },
  history: [],
  blastRadius: { affectsPublicSite: true, sitesAffected: 1 },
  actorRole: "MEMBER",
  now: new Date("2026-10-30T10:00:00Z"),
  ...over,
});
const act = (
  type: string,
  parameters: Record<string, unknown> = {},
  over: Partial<PolicyInput> = {},
) => evaluatePolicy(base({ action: { type, parameters }, ...over }));

describe("policy engine", () => {
  it("auto-allows a read-only health check", () =>
    expect(act("run_health_check").decision).toBe("ALLOW"));
  it("auto-allows an idempotent republish of the already-published version", () => {
    expect(act("republish_site_version", { versionId: V2 })).toMatchObject({
      decision: "ALLOW",
      policyCode: "POLICY_IDEMPOTENT_REPUBLISH",
    });
  });
  it("requires approval to switch to a previous version, with expiry and approver role", () => {
    const r = act("republish_site_version", { versionId: V1 });
    expect(r).toMatchObject({
      decision: "REQUIRE_APPROVAL",
      approverMinRole: "ADMIN",
    });
    expect(r.expiresAt).toBe("2026-10-30T10:30:00.000Z");
  });
  it("requires approval for workload changes when the provider supports them", () => {
    for (const [type, cap] of [
      ["restart_service", "RESTART"],
      ["redeploy", "REDEPLOY"],
      ["rollback_deployment", "ROLLBACK"],
    ] as const)
      expect(
        act(
          type,
          {},
          { target: { ...base().target, capabilities: new Set([cap]) } },
        ).decision,
      ).toBe("REQUIRE_APPROVAL");
  });
  it("denies workload actions the provider cannot perform", () => {
    expect(act("restart_service")).toMatchObject({
      decision: "DENY",
      policyCode: "POLICY_PROVIDER_UNSUPPORTED",
    });
  });
  it("denies workload actions on an incompletely identified resource", () => {
    const r = act(
      "restart_service",
      {},
      {
        target: {
          ...base().target,
          identityComplete: false,
          capabilities: new Set(["RESTART"]),
        },
      },
    );
    expect(r.policyCode).toBe("POLICY_INSUFFICIENT_RESOURCE_IDENTITY");
  });
  it("never executes destructive or unrestricted operations, whoever asks", () => {
    for (const t of [
      "delete_vm",
      "delete_database",
      "destroy_volume",
      "delete_domain",
      "exec",
      "shell",
      "rotate_secret",
      "purchase_domain",
      "create_billable_infrastructure",
      "destructive_database",
    ])
      expect(act(t, {}, { actorRole: "OWNER" })).toMatchObject({
        decision: "DENY",
        policyCode: "POLICY_FORBIDDEN_OPERATION",
      });
  });
  it("denies unknown actions and malformed parameters", () => {
    expect(act("make_it_faster").policyCode).toBe("POLICY_UNKNOWN_ACTION");
    expect(
      act("republish_site_version", { versionId: "not-a-uuid" }).policyCode,
    ).toBe("POLICY_INVALID_PARAMETERS");
    expect(
      act("republish_site_version", { versionId: V1, command: "rm -rf /" })
        .policyCode,
    ).toBe("POLICY_INVALID_PARAMETERS");
  });
  it("denies viewers and loops", () => {
    expect(
      act("run_health_check", {}, { actorRole: "VIEWER" }).policyCode,
    ).toBe("POLICY_ROLE_INSUFFICIENT");
    const history = [1, 2, 3].map((n) => ({
      type: "run_health_check",
      outcome: "SUCCEEDED",
      at: `2026-10-30T09:${50 + n}:00Z`,
    }));
    expect(act("run_health_check", {}, { history }).policyCode).toBe(
      "POLICY_REPEATED_ACTION",
    );
  });
  it("is deterministic", () =>
    expect(act("republish_site_version", { versionId: V1 })).toEqual(
      act("republish_site_version", { versionId: V1 }),
    ));
});
