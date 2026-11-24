import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
const brief = {
  name: "Meridian Bakes",
  industry: "bakery",
  description: "Artisan sourdough bread, pastries and custom cakes.",
  services: ["Sourdough", "Pastries", "Custom cakes"],
  whatsapp: "+2348012345678",
};
suite("M3/M4 real authenticated creative document lifecycle", () => {
  it("creates, edits, reopens, restores and exports vector graphics with tenant isolation", async () => {
    const owner = await h.signup("krevm3-owner@example.com");
    const site = (
      await h.call("POST", "/api/sites", {
        cookie: owner.cookie,
        body: { orgId: owner.orgId, name: brief.name },
      })
    ).json.data;
    const gen = await h.call("POST", `/api/sites/${site.id}/generate`, {
      cookie: owner.cookie,
      body: brief,
    });
    expect(gen.status).toBe(201);
    const req = {
      kind: "carousel",
      title: "Bakery launch",
      headline: "Meridian Bakes",
      description: "Artisan sourdough bread",
      cta: "Message us",
      slides: 4,
      direction: 1,
    };
    const made = await h.call(
      "POST",
      `/api/sites/${site.id}/creative-documents`,
      { cookie: owner.cookie, body: req },
    );
    expect(made.status).toBe(201);
    const id = made.json.data.id as string;
    expect(made.json.data.source.slides).toHaveLength(4);
    const before = await h.call(
      "GET",
      `/api/sites/${site.id}/creative-documents/${id}`,
      { cookie: owner.cookie },
    );
    expect(before.json.data.revision).toBe(1);
    const updated = structuredClone(before.json.data.source);
    const editableText = updated.slides[1].layers.find(
      (layer: { type: string }) => layer.type === "text",
    );
    expect(editableText).toBeDefined();
    editableText.text = "Our Saturday launch";
    const edit = await h.call(
      "PUT",
      `/api/sites/${site.id}/creative-documents/${id}`,
      { cookie: owner.cookie, body: { revision: 1, source: updated } },
    );
    expect(edit.status).toBe(200);
    expect(edit.json.data.revision).toBe(2);
    const stale = await h.call(
      "PUT",
      `/api/sites/${site.id}/creative-documents/${id}`,
      { cookie: owner.cookie, body: { revision: 1, source: updated } },
    );
    expect(stale.status).toBe(409);
    const reopen = await h.call(
      "GET",
      `/api/sites/${site.id}/creative-documents/${id}`,
      { cookie: owner.cookie },
    );
    expect(
      reopen.json.data.source.slides[1].layers.find(
        (layer: { type: string }) => layer.type === "text",
      ).text,
    ).toBe("Our Saturday launch");
    const response = await fetch(
      h.base + `/api/sites/${site.id}/creative-documents/${id}/export/0`,
      { headers: { cookie: owner.cookie } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/svg+xml");
    expect(await response.text()).toContain("<svg");
    const other = await h.signup("krevm3-other@example.com");
    const hidden = await h.call(
      "GET",
      `/api/sites/${site.id}/creative-documents/${id}`,
      { cookie: other.cookie },
    );
    expect([403, 404]).toContain(hidden.status);
    const restore = await h.call(
      "POST",
      `/api/sites/${site.id}/creative-documents/${id}/restore`,
      {
        cookie: owner.cookie,
        body: { revision: 1, currentRevision: 2 },
      },
    );
    expect(restore.status).toBe(200);
    expect(restore.json.data.revision).toBe(3);
    const history = await h.call(
      "GET",
      `/api/sites/${site.id}/creative-documents/${id}/history`,
      { cookie: owner.cookie },
    );
    expect(history.json.data).toHaveLength(3);
  });
  it("approves a vector logo and binds new designs to a new immutable BrandOS version", async () => {
    const owner = await h.signup("krevm4-owner@example.com");
    const site = (
      await h.call("POST", "/api/sites", {
        cookie: owner.cookie,
        body: { orgId: owner.orgId, name: brief.name },
      })
    ).json.data;
    const gen = await h.call("POST", `/api/sites/${site.id}/generate`, {
      cookie: owner.cookie,
      body: brief,
    });
    expect(gen.status).toBe(201);
    const logo = await h.call(
      "POST",
      `/api/sites/${site.id}/creative-documents`,
      {
        cookie: owner.cookie,
        body: {
          kind: "logo",
          title: "Approved monogram",
          headline: "Meridian Bakes",
          direction: 1,
        },
      },
    );
    expect(logo.status).toBe(201);
    const logoId = logo.json.data.id;
    const activationBefore = await h.call(
      "POST",
      `/api/sites/${site.id}/creative-documents/${logoId}/activate-logo`,
      { cookie: owner.cookie },
    );
    expect(activationBefore.status).toBe(409);
    const approved = await h.call(
      "POST",
      `/api/sites/${site.id}/creative-documents/${logoId}/approve`,
      { cookie: owner.cookie, body: { revision: 1 } },
    );
    expect(approved.status).toBe(200);
    const activate = await h.call(
      "POST",
      `/api/sites/${site.id}/creative-documents/${logoId}/activate-logo`,
      { cookie: owner.cookie },
    );
    expect(activate.status).toBe(200);
    expect(activate.json.data.version).toBeGreaterThan(1);
    const graphic = await h.call(
      "POST",
      `/api/sites/${site.id}/creative-documents`,
      {
        cookie: owner.cookie,
        body: {
          kind: "flyer",
          title: "Seasonal launch",
          headline: "Artisan pastries",
          direction: 0,
        },
      },
    );
    expect(graphic.status).toBe(201);
    expect(graphic.json.data.source.approvedLogoId).toBe(logoId);
    expect(graphic.json.data.source.brandVersion).toBe(
      activate.json.data.version,
    );
    const swap = structuredClone(graphic.json.data.source);
    swap.approvedLogoId = crypto.randomUUID();
    const illegal = await h.call(
      "PUT",
      `/api/sites/${site.id}/creative-documents/${graphic.json.data.id}`,
      {
        cookie: owner.cookie,
        body: { revision: 1, source: swap },
      },
    );
    expect(illegal.status).toBe(409);
  });
  it("persists owner graphic style corrections and changes future generated designs across requests", async () => {
    const owner = await h.signup("krev-graphic-memory-owner@example.com");
    const outsider = await h.signup("krev-graphic-memory-other@example.com");
    const site = (
      await h.call("POST", "/api/sites", {
        cookie: owner.cookie,
        body: { orgId: owner.orgId, name: "Meridian Bakes" },
      })
    ).json.data;
    const request = {
      kind: "flyer",
      title: "Bakery launch",
      headline: "Celebration cakes baked to order",
      description: "Order in advance",
      cta: "Contact us",
    };
    const previewUrl = `/api/sites/${site.id}/creative-documents/preview`;
    const feedbackUrl = `/api/sites/${site.id}/creative-documents/style-feedback`;
    const baseline = await h.call("POST", previewUrl, {
      cookie: owner.cookie,
      body: request,
    });
    expect(baseline.status).toBe(200);
    expect(baseline.json.data.directions).toHaveLength(3);
    expect(baseline.json.data.memory).toMatchObject({
      direction: 0,
      applied: false,
    });
    const forbidden = await h.call("POST", feedbackUrl, {
      cookie: outsider.cookie,
      body: { direction: 0, outcome: "rejected", locked: true },
    });
    expect([403, 404]).toContain(forbidden.status);
    const rejected = await h.call("POST", feedbackUrl, {
      cookie: owner.cookie,
      body: { direction: 0, outcome: "rejected", locked: true },
    });
    expect(rejected.status).toBe(200);
    expect(rejected.json.data.memory).toMatchObject({
      direction: 1,
      applied: true,
    });
    const memoryAfterFetch = await h.call("POST", previewUrl, {
      cookie: owner.cookie,
      body: request,
    });
    expect(memoryAfterFetch.json.data.memory.direction).toBe(1);
    const made = await h.call(
      "POST",
      `/api/sites/${site.id}/creative-documents`,
      {
        cookie: owner.cookie,
        body: request,
      },
    );
    expect(made.status).toBe(201);
    const source = made.json.data.source;
    const background = source.slides[0].background;
    expect(background).toBe(
      memoryAfterFetch.json.data.directions[1].source.slides[0].background,
    );
    expect(background).not.toBe(
      memoryAfterFetch.json.data.directions[0].source.slides[0].background,
    );
    const explicit = await h.call(
      "POST",
      `/api/sites/${site.id}/creative-documents`,
      {
        cookie: owner.cookie,
        body: { ...request, direction: 2 },
      },
    );
    expect(explicit.status).toBe(201);
    expect(explicit.json.data.source.slides[0].background).toBe(
      memoryAfterFetch.json.data.directions[2].source.slides[0].background,
    );
    const corrected = await h.call("POST", feedbackUrl, {
      cookie: owner.cookie,
      body: { direction: 0, outcome: "chosen", locked: true },
    });
    expect(corrected.status).toBe(200);
    expect(corrected.json.data.memory.direction).toBe(0);
    const refetched = await h.call("POST", previewUrl, {
      cookie: owner.cookie,
      body: request,
    });
    expect(refetched.json.data.memory.direction).toBe(0);
  });
});
