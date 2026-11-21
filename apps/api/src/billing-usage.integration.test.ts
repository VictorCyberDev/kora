import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BillingService, unconfiguredPayments } from "./platform/billing.js";
import { startHarness, type Harness } from "./test-support/platform-harness.js";

const enabled = Boolean(process.env.DATABASE_URL);
const suite = enabled ? describe : describe.skip;
let h: Harness;
beforeAll(async () => {
  if (enabled) h = await startHarness();
});
afterAll(async () => {
  if (enabled) await h.close();
});

suite("commercial usage reservations", () => {
  it("atomically caps simultaneous exports and remains idempotent across restarts", async () => {
    const owner = await h.signup("usage-owner@example.com", "Usage test");
    await h.sql`UPDATE plans SET capabilities=capabilities ||
      ${h.sql.json({ exportsPerMonth: 2, videoRendersPerMonth: 1 })}
      WHERE code='trial'`;

    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        h.runtime.billing.reserveUsage({
          orgId: owner.orgId,
          siteId: null,
          kind: "export",
          idempotencyKey: `parallel-export-${index}`,
        }),
      ),
    );
    const accepted = attempts.filter(
      (
        result,
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof h.runtime.billing.reserveUsage>>
      > => result.status === "fulfilled",
    );
    expect(accepted).toHaveLength(2);
    expect(
      attempts.filter((result) => result.status === "rejected"),
    ).toHaveLength(6);

    const first = accepted[0]!.value;
    const same = await h.runtime.billing.reserveUsage({
      orgId: owner.orgId,
      siteId: null,
      kind: "export",
      idempotencyKey: "parallel-export-0",
    });
    expect(same.id).toBe(first.id);
    expect(same.created).toBe(false);
    await h.runtime.billing.consumeUsage(first.id);
    await h.runtime.billing.consumeUsage(first.id);

    const consumed = await h.sql`SELECT count(*)::int AS events
      FROM usage_events WHERE usage_reservation_id=${first.id}`;
    expect(Number(consumed[0]!.events)).toBe(1);

    const second = accepted[1]!.value;
    await h.runtime.billing.releaseUsage(second.id);
    const replacement = await h.runtime.billing.reserveUsage({
      orgId: owner.orgId,
      siteId: null,
      kind: "export",
      idempotencyKey: "replacement-export",
    });
    expect(replacement.state).toBe("RESERVED");

    const restarted = new BillingService({
      platform: h.runtime.platform,
      payments: unconfiguredPayments,
      publicUrl: undefined,
    });
    await restarted.consumeUsage(replacement.id);
    await restarted.consumeUsage(replacement.id);
    const limits = await restarted.usageLimits(owner.orgId);
    expect(limits.find((x) => x.kind === "export")).toMatchObject({
      limit: 2,
      remaining: 0,
      committed: 2,
    });
  });

  it("permits only one simultaneous video reservation and reuses retry keys", async () => {
    const owner = await h.signup("video-usage@example.com", "Video usage");
    await h.sql`UPDATE plans SET capabilities=capabilities ||
      ${h.sql.json({ exportsPerMonth: 2, videoRendersPerMonth: 1 })}
      WHERE code='trial'`;
    const results = await Promise.allSettled([
      h.runtime.billing.reserveUsage({
        orgId: owner.orgId,
        siteId: null,
        kind: "video_render",
        idempotencyKey: "video-render-a",
      }),
      h.runtime.billing.reserveUsage({
        orgId: owner.orgId,
        siteId: null,
        kind: "video_render",
        idempotencyKey: "video-render-b",
      }),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((x) => x.status === "rejected")).toHaveLength(1);
    const reserved = results.find(
      (
        x,
      ): x is PromiseFulfilledResult<
        Awaited<ReturnType<typeof h.runtime.billing.reserveUsage>>
      > => x.status === "fulfilled",
    )!.value;
    await h.runtime.billing.releaseUsage(reserved.id);
    const retried = await h.runtime.billing.reserveUsage({
      orgId: owner.orgId,
      siteId: null,
      kind: "video_render",
      idempotencyKey:
        reserved.id ===
        (results[0].status === "fulfilled" ? results[0].value.id : "")
          ? "video-render-a"
          : "video-render-b",
    });
    expect(retried.id).toBe(reserved.id);
    expect(retried.state).toBe("RESERVED");
  });
});
