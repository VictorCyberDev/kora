import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./test-support/platform-harness.js";

const enabled = Boolean(process.env.DATABASE_URL);
const suite = enabled ? describe : describe.skip;
let h: Harness;
beforeAll(async () => {
  if (enabled) h = await startHarness({ env: { KORA_CREATIVE_ENGINE: "v3" } });
});
afterAll(async () => {
  if (enabled) await h.close();
});

suite("CREATIVE-M9 agency review and client isolation", () => {
  it("binds comments and approval to one client revision without leaking another client", async () => {
    const owner = await h.signup("agency-owner@example.com", "Agency");
    const approver = await h.signup(
      "client-approver@example.com",
      "Client account",
    );
    const outsider = await h.signup("other-client@example.com", "Other client");
    const site = (
      await h.call("POST", "/api/sites", {
        cookie: owner.cookie,
        body: { orgId: owner.orgId, name: "Meridian Bakes" },
      })
    ).json.data;
    await h.call("POST", `/api/sites/${site.id}/generate`, {
      cookie: owner.cookie,
      body: {
        name: "Meridian Bakes",
        industry: "bakery",
        description: "Artisan bread, pastries and custom cakes.",
        services: ["Bread", "Pastries", "Custom cakes"],
        whatsapp: "+2348012345678",
      },
    });
    const design = await h.call(
      "POST",
      `/api/sites/${site.id}/creative-documents`,
      {
        cookie: owner.cookie,
        body: {
          kind: "flyer",
          title: "Christmas orders",
          headline: "Christmas orders are open",
          description: "Artisan cakes by Meridian Bakes",
          cta: "Order on WhatsApp",
          slides: 1,
          direction: 0,
        },
      },
    );
    expect(design.status).toBe(201);
    await h.call("POST", `/api/orgs/${owner.orgId}/members`, {
      cookie: owner.cookie,
      body: { email: "client-approver@example.com", role: "VIEWER" },
    });
    await h.call(
      "PUT",
      `/api/sites/${site.id}/collaborators/${approver.userId}`,
      { cookie: owner.cookie, body: { role: "APPROVER" } },
    );
    const review = await h.call("POST", `/api/sites/${site.id}/asset-reviews`, {
      cookie: owner.cookie,
      body: {
        objectType: "creative_document",
        objectId: design.json.data.id,
        version: 1,
        title: "Approve the Christmas flyer",
      },
    });
    expect(review.status).toBe(201);
    const reviewId = review.json.data.id as string;
    const revisionOneSource = structuredClone(design.json.data.source);
    const revisionTwoSource = structuredClone(revisionOneSource);
    revisionTwoSource.title = "Christmas orders — revised";
    const revisionTwo = await h.call(
      "PUT",
      `/api/sites/${site.id}/creative-documents/${design.json.data.id}`,
      {
        cookie: owner.cookie,
        body: { revision: 1, source: revisionTwoSource },
      },
    );
    expect(revisionTwo.status).toBe(200);
    expect(revisionTwo.json.data.revision).toBe(2);
    const comment = await h.call(
      "POST",
      `/api/sites/${site.id}/asset-reviews/${reviewId}/comments`,
      {
        cookie: approver.cookie,
        body: {
          body: "Make the order deadline more prominent.",
          anchor: { slide: 0 },
        },
      },
    );
    expect(comment.status).toBe(201);
    const hidden = await h.call(
      "GET",
      `/api/sites/${site.id}/asset-reviews/${reviewId}`,
      { cookie: outsider.cookie },
    );
    expect([403, 404]).toContain(hidden.status);
    const approved = await h.call(
      "POST",
      `/api/sites/${site.id}/asset-reviews/${reviewId}/decision`,
      {
        cookie: approver.cookie,
        body: {
          decision: "APPROVED",
          note: "Approved for this exact revision.",
        },
      },
    );
    expect(approved.status).toBe(200);
    expect(approved.json.data.status).toBe("APPROVED");
    const duplicate = await h.call(
      "POST",
      `/api/sites/${site.id}/asset-reviews/${reviewId}/decision`,
      {
        cookie: approver.cookie,
        body: { decision: "APPROVED", note: "again" },
      },
    );
    expect(duplicate.status).toBe(409);
    const share = await h.call(
      "POST",
      `/api/sites/${site.id}/asset-reviews/${reviewId}/share`,
      { cookie: owner.cookie, body: { days: 7 } },
    );
    expect(share.status).toBe(201);
    const preview = await fetch(
      `${h.base}/api/public/review-preview/${share.json.data.token}`,
    );
    expect(preview.status).toBe(200);
    const payload = (await preview.json()) as {
      data: { source: unknown; version: number };
    };
    expect(payload.data.version).toBe(1);
    expect(payload.data.source).toEqual(revisionOneSource);
    expect(payload.data.source).not.toEqual(revisionTwoSource);
    const current = await h.call(
      "GET",
      `/api/sites/${site.id}/creative-documents/${design.json.data.id}`,
      { cookie: owner.cookie },
    );
    expect(current.json.data.revision).toBe(2);

    const secondReview = await h.call(
      "POST",
      `/api/sites/${site.id}/asset-reviews`,
      {
        cookie: owner.cookie,
        body: {
          objectType: "creative_document",
          objectId: design.json.data.id,
          version: 2,
          title: "Approve revision two",
        },
      },
    );
    expect(secondReview.status).toBe(201);
    const decisions = await Promise.all([
      h.call(
        "POST",
        `/api/sites/${site.id}/asset-reviews/${secondReview.json.data.id}/decision`,
        {
          cookie: approver.cookie,
          body: { decision: "APPROVED", note: "first" },
        },
      ),
      h.call(
        "POST",
        `/api/sites/${site.id}/asset-reviews/${secondReview.json.data.id}/decision`,
        {
          cookie: approver.cookie,
          body: { decision: "REJECTED", note: "racing decision" },
        },
      ),
    ]);
    expect(decisions.map((result) => result.status).sort()).toEqual([200, 409]);

    const revoked = await h.call(
      "DELETE",
      `/api/sites/${site.id}/asset-reviews/${reviewId}/shares/${share.json.data.id}`,
      { cookie: owner.cookie },
    );
    expect(revoked.status).toBe(200);
    const afterRevoke = await fetch(
      `${h.base}/api/public/review-preview/${share.json.data.token}`,
    );
    expect(afterRevoke.status).toBe(404);
  });
});
