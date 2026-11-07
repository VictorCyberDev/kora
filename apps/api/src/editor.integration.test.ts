import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./test-support/platform-harness.js";

const enabled = Boolean(process.env.DATABASE_URL);
const d = enabled ? describe : describe.skip;
let h: Harness;
beforeAll(async () => {
  if (enabled) h = await startHarness({ env: { KORA_CREATIVE_ENGINE: "v3" } });
});
afterAll(async () => {
  if (enabled) await h.close();
});

d("the visual editor's operations, through the real API", () => {
  it("edits pages, sections and items; undoes and restores; publishes the edited version", async () => {
    const o = await h.signup("editor-owner@example.com");
    const site = (
      await h.call("POST", "/api/sites", {
        cookie: o.cookie,
        body: {
          orgId: o.orgId,
          name: "Sweet Crumbs Bakery",
          description: "I bake cakes and small chops.",
        },
      })
    ).json.data;
    const gen = await h.call("POST", `/api/sites/${site.id}/generate`, {
      cookie: o.cookie,
      body: {
        name: "Sweet Crumbs Bakery",
        description: "I bake cakes and small chops.",
      },
    });
    let head: string = gen.json.data.version.id;
    const edit = async (designEdit: object) => {
      const r = await h.call("POST", `/api/sites/${site.id}/edit`, {
        cookie: o.cookie,
        body: { baseVersionId: head, designEdit },
      });
      expect(r.status, JSON.stringify(r.json)).toBe(201);
      head = r.json.data.version.id;
      return (
        await h.call("GET", `/api/sites/${site.id}/versions/${head}`, {
          cookie: o.cookie,
        })
      ).json.data.spec;
    };
    let spec = await edit({
      kind: "page-meta",
      page: "cakes",
      title: "Our cakes",
      nav: "Cakes",
    });
    expect(
      spec.pages.find((p: { slug: string }) => p.slug === "cakes").title,
    ).toBe("Our cakes");
    spec = await edit({ kind: "remove-page", slug: "gallery" });
    spec = await edit({ kind: "add-page", page: "faq" });
    expect(spec.pages.map((p: { slug: string }) => p.slug)).toContain("faq");
    const homeOffer = spec.pages[0].sections.findIndex(
      (s: { type: string }) => s.type === "offer",
    );
    spec = await edit({
      kind: "item",
      page: "home",
      index: homeOffer,
      action: "update",
      item: 1,
      title: "Party small chops",
    });
    expect(spec.pages[0].sections[homeOffer].items[1].title).toBe(
      "Party small chops",
    );
    spec = await edit({ kind: "regenerate-page", page: "about" });
    const undoTarget = head; // the version before the next change
    spec = await edit({
      kind: "section-text",
      page: "home",
      index: 0,
      heading: "Cakes and party small chops.",
    });
    expect(spec.pages[0].sections[0].heading).toBe(
      "Cakes and party small chops.",
    );

    // undo: restore the earlier version as a new draft (history is untouched)
    const before = (
      await h.call("GET", `/api/sites/${site.id}/versions`, {
        cookie: o.cookie,
      })
    ).json.data.length;
    const restored = await h.call(
      "POST",
      `/api/sites/${site.id}/versions/${undoTarget}/restore-draft`,
      { cookie: o.cookie },
    );
    expect(restored.status).toBe(201);
    const after = (
      await h.call("GET", `/api/sites/${site.id}/versions`, {
        cookie: o.cookie,
      })
    ).json.data;
    expect(after.length).toBe(before + 1);
    const restoredSpec = (
      await h.call(
        "GET",
        `/api/sites/${site.id}/versions/${restored.json.data.version.id}`,
        { cookie: o.cookie },
      )
    ).json.data.spec;
    expect(restoredSpec.pages[0].sections[0].heading).not.toBe(
      "Cakes and party small chops.",
    );
    expect(
      restoredSpec.pages.find((p: { slug: string }) => p.slug === "cakes")
        .title,
    ).toBe("Our cakes");

    // an edit that the schema or the limit refuses leaves everything as it was
    const n = after.length;
    const bad = await h.call("POST", `/api/sites/${site.id}/edit`, {
      cookie: o.cookie,
      body: {
        baseVersionId: head,
        designEdit: { kind: "add-page", page: "faq" },
      },
    });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(
      (
        await h.call("GET", `/api/sites/${site.id}/versions`, {
          cookie: o.cookie,
        })
      ).json.data.length,
    ).toBe(n);

    // the catalogue picker lists only vetted pictures for this business, with credit
    const cat = (
      await h.call("GET", `/api/sites/${site.id}/media/catalogue`, {
        cookie: o.cookie,
      })
    ).json.data;
    expect(cat.length).toBeGreaterThanOrEqual(10);
    expect(
      cat.every(
        (m: { url: string; alt: string }) =>
          m.url.startsWith("/_kora/media/") && m.alt.length > 5,
      ),
    ).toBe(true);

    // publish the restored draft: the live site matches it
    const pub = await h.call(
      "POST",
      `/api/sites/${site.id}/versions/${restored.json.data.version.id}/publish`,
      { cookie: o.cookie },
    );
    expect(pub.json.data.verification.status).toBe("MATCH");
    expect((await fetch(`${pub.json.data.publicUrl}cakes/`)).status).toBe(200);
  });

  it("another account cannot edit, restore or list pictures for this site", async () => {
    const a = await h.signup("editor-a@example.com");
    const b = await h.signup("editor-b@example.com");
    const site = (
      await h.call("POST", "/api/sites", {
        cookie: a.cookie,
        body: { orgId: a.orgId, name: "Mine", description: "I bake cakes." },
      })
    ).json.data;
    const gen = await h.call("POST", `/api/sites/${site.id}/generate`, {
      cookie: a.cookie,
      body: { name: "Mine", description: "I bake cakes and bread." },
    });
    const v = gen.json.data.version.id;
    expect(
      (
        await h.call(
          "POST",
          `/api/sites/${site.id}/versions/${v}/restore-draft`,
          { cookie: b.cookie },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await h.call("GET", `/api/sites/${site.id}/media/catalogue`, {
          cookie: b.cookie,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await h.call("POST", `/api/sites/${site.id}/edit`, {
          cookie: b.cookie,
          body: {
            baseVersionId: v,
            designEdit: { kind: "add-page", page: "faq" },
          },
        })
      ).status,
    ).toBe(404);
  });
});
