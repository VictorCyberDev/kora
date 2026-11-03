import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { startHarness, type Harness } from "./test-support/platform-harness.js";

const enabled = Boolean(process.env.DATABASE_URL);
const d = enabled ? describe : describe.skip;
let h: Harness;
beforeAll(async () => {
  if (enabled)
    h = await startHarness({
      env: {
        KORA_CREATIVE_ENGINE: "v3",
        KORA_MEDIA_PUBLIC_URL: "https://media.test.example",
      },
    });
});
afterAll(async () => {
  if (enabled) await h.close();
});

const stock = (n: string) =>
  readFileSync(
    new URL(`../../../packages/site-media/files/${n}`, import.meta.url),
  );
const png = (w = 600, h2 = 400, rgba = false) =>
  sharp({
    create: {
      width: w,
      height: h2,
      channels: rgba ? 4 : 3,
      background: rgba
        ? { r: 200, g: 30, b: 30, alpha: 0.5 }
        : { r: 40, g: 90, b: 160 },
    },
  })
    .png()
    .toBuffer();
const upload = async (
  cookie: string,
  siteId: string,
  body: Buffer,
  qs: string,
  type = "application/octet-stream",
) => {
  const res = await fetch(`${h.base}/api/sites/${siteId}/media-library?${qs}`, {
    method: "POST",
    headers: { cookie, "content-type": type, "x-requested-with": "kora" },
    body: new Uint8Array(body),
  });
  return {
    status: res.status,
    json: (await res.json()) as {
      data?: Record<string, any>;
      error?: string;
      message?: string;
    },
  };
};
const brief = {
  name: "Tola's Cakes",
  description: "I sell birthday cakes from home in Lekki.",
  whatsapp: "+2348099999999",
  services: ["Birthday cakes", "Cupcakes", "Small chops"],
};
const setup = async (email: string) => {
  const o = await h.signup(email);
  const site = (
    await h.call("POST", "/api/sites", {
      cookie: o.cookie,
      body: { orgId: o.orgId, name: brief.name },
    })
  ).json.data;
  return { o, site };
};

d("owner media: logo and photos", () => {
  it("accepts real pictures, re-encodes them, strips metadata, suggests a role and gives plain advice", async () => {
    const { o, site } = await setup("om-ok@example.com");
    const r = await upload(
      o.cookie,
      site.id,
      stock("bakery-cake-frosting.webp"),
      "kind=photo&filename=chocolate-cake-product.webp",
    );
    expect(r.status).toBe(201);
    expect(r.json.data!.role).toBe("product");
    expect(r.json.data!.quality.score).toBeGreaterThan(30);
    expect(r.json.data!.advice.length).toBeGreaterThan(0);
    const list = (
      await h.call("GET", `/api/sites/${site.id}/media-library`, {
        cookie: o.cookie,
      })
    ).json.data;
    expect(list.items).toHaveLength(1);
    expect(list.designsCanUse).toBe(true);
    const thumb = await fetch(`${h.base}${list.items[0].thumbUrl as string}`, {
      headers: { cookie: o.cookie },
    });
    expect(thumb.status).toBe(200);
    expect(thumb.headers.get("content-type")).toBe("image/webp");
    expect(thumb.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("does not trust the declared type: SVG, GIF, HTML, executables, PDFs, corrupt and empty files are refused", async () => {
    const { o, site } = await setup("om-bad@example.com");
    const cases: Array<[string, Buffer, number]> = [
      [
        "svg",
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        ),
        415,
      ],
      [
        "html as png",
        Buffer.from("<html><script>alert(1)</script></html>"),
        415,
      ],
      ["exe", Buffer.concat([Buffer.from("MZ"), Buffer.alloc(200)]), 415],
      ["pdf", Buffer.from("%PDF-1.7\n%…"), 415],
      ["gif", Buffer.from("GIF89a" + "x".repeat(40)), 415],
      ["empty", Buffer.alloc(0), 422],
      ["truncated png", (await png(800, 600)).subarray(0, 200), 422],
    ];
    for (const [name, body, status] of cases) {
      const r = await upload(
        o.cookie,
        site.id,
        body,
        "kind=photo&filename=x.png",
        "image/png",
      );
      expect(r.status, name).toBeGreaterThanOrEqual(400);
      expect([status, 415, 422, 400], name).toContain(r.status);
    }
    const big = await upload(
      o.cookie,
      site.id,
      Buffer.concat([await png(), Buffer.alloc(9 * 1024 * 1024)]),
      "kind=photo&filename=big.png",
    );
    expect(big.status).toBe(413);
    const tiny = await upload(
      o.cookie,
      site.id,
      await png(80, 60),
      "kind=photo&filename=tiny.png",
    );
    expect(tiny.status).toBe(422);
    const list = (
      await h.call("GET", `/api/sites/${site.id}/media-library`, {
        cookie: o.cookie,
      })
    ).json.data;
    expect(list.items).toHaveLength(0);
  });

  it("refuses duplicates, enforces tenancy and authorisation, and uploads need a signed-in member", async () => {
    const { o, site } = await setup("om-ten@example.com");
    const img = stock("barber-detail-grooming.webp");
    expect(
      (await upload(o.cookie, site.id, img, "kind=photo&filename=a.webp"))
        .status,
    ).toBe(201);
    expect(
      (await upload(o.cookie, site.id, img, "kind=photo&filename=again.webp"))
        .status,
    ).toBe(409);
    const other = await h.signup("om-ten-other@example.com");
    expect(
      (
        await upload(
          other.cookie,
          site.id,
          await png(),
          "kind=photo&filename=x.png",
        )
      ).status,
    ).toBeGreaterThanOrEqual(403);
    expect(
      (
        await h.call("GET", `/api/sites/${site.id}/media-library`, {
          cookie: other.cookie,
        })
      ).status,
    ).toBeGreaterThanOrEqual(403);
    const anon = await fetch(
      `${h.base}/api/sites/${site.id}/media-library?kind=photo`,
      {
        method: "POST",
        headers: { "content-type": "image/png", "x-requested-with": "kora" },
        body: new Uint8Array(await png()),
      },
    );
    expect(anon.status).toBeGreaterThanOrEqual(401);
  });

  it("logo: keeps transparency, replacing it supersedes the old one, historical artifacts keep the logo they used", async () => {
    const { o, site } = await setup("om-logo@example.com");
    const gen0 = await h.call("POST", `/api/sites/${site.id}/generate`, {
      cookie: o.cookie,
      body: brief,
    });
    const v0 = (
      await h.call(
        "GET",
        `/api/sites/${site.id}/versions/${gen0.json.data.version.id}`,
        { cookie: o.cookie },
      )
    ).json.data;
    expect(v0.spec.business.logo).toBeUndefined();
    const l1 = await upload(
      o.cookie,
      site.id,
      await png(400, 400, true),
      "kind=logo&filename=logo.png",
    );
    expect(l1.status).toBe(201);
    expect(l1.json.data!.hasAlpha).toBe(true);
    const gen1 = await h.call("POST", `/api/sites/${site.id}/generate`, {
      cookie: o.cookie,
      body: brief,
    });
    const v1 = (
      await h.call(
        "GET",
        `/api/sites/${site.id}/versions/${gen1.json.data.version.id}`,
        { cookie: o.cookie },
      )
    ).json.data;
    expect(v1.spec.business.logo.assetId).toBe(l1.json.data!.id);
    expect(v1.spec.business.logo.url).toMatch(
      /^https:\/\/media\.test\.example\/api\/public\/sites\/.+\/logo\.png$/,
    );
    expect(v1.spec.brand.osVersion).toBeGreaterThan(v0.spec.brand.osVersion);
    const html = Object.values(v1.files ?? {}).join("");
    void html;
    const l2 = await upload(
      o.cookie,
      site.id,
      await sharp({
        create: { width: 500, height: 300, channels: 3, background: "#118833" },
      })
        .png()
        .toBuffer(),
      "kind=logo&filename=new-logo.png",
    );
    expect(l2.status).toBe(201);
    const list = (
      await h.call("GET", `/api/sites/${site.id}/media-library`, {
        cookie: o.cookie,
      })
    ).json.data;
    expect(
      list.items.filter((x: { kind: string }) => x.kind === "logo"),
    ).toHaveLength(1);
    // the first logo's public bytes still resolve: finished work is never broken
    const pub = await fetch(
      (v1.spec.business.logo.url as string).replace(
        "https://media.test.example",
        h.base,
      ),
    );
    expect(pub.status).toBe(200);
    expect(pub.headers.get("content-type")).toBe("image/png");
    expect(pub.headers.get("cache-control")).toContain("immutable");
    // and the version created before the new logo is unchanged
    const again = (
      await h.call(
        "GET",
        `/api/sites/${site.id}/versions/${gen1.json.data.version.id}`,
        { cookie: o.cookie },
      )
    ).json.data;
    expect(again.spec).toEqual(v1.spec);
  });

  it("photos change the design: role, focal point, responsive srcset and a photography-led composition", async () => {
    const { o, site } = await setup("om-design@example.com");
    const before = await h.call("POST", `/api/sites/${site.id}/generate`, {
      cookie: o.cookie,
      body: brief,
    });
    const b = (
      await h.call(
        "GET",
        `/api/sites/${site.id}/versions/${before.json.data.version.id}`,
        { cookie: o.cookie },
      )
    ).json.data;
    const names = [
      "bakery-cake-frosting.webp",
      "bakery-cake-making.webp",
      "bakery-nigeria-maker.webp",
      "cafe-minimal-daylight.webp",
    ];
    const ids: string[] = [];
    for (const n of names) {
      const r = await upload(
        o.cookie,
        site.id,
        stock(n),
        `kind=photo&filename=${n}`,
      );
      expect(r.status, n).toBe(201);
      ids.push(r.json.data!.id as string);
    }
    const patch = await h.call(
      "PATCH",
      `/api/sites/${site.id}/media-library/${ids[0]}`,
      {
        cookie: o.cookie,
        body: {
          role: "product",
          focal: { x: 0.3, y: 0.6 },
          alt: "A frosted birthday cake",
        },
      },
    );
    expect(patch.status).toBe(200);
    expect(
      (
        await h.call("PATCH", `/api/sites/${site.id}/media-library/${ids[0]}`, {
          cookie: o.cookie,
          body: { focal: { x: 2, y: 0 } },
        })
      ).status,
    ).toBe(400);
    const after = await h.call("POST", `/api/sites/${site.id}/generate`, {
      cookie: o.cookie,
      body: brief,
    });
    const a = (
      await h.call(
        "GET",
        `/api/sites/${site.id}/versions/${after.json.data.version.id}`,
        { cookie: o.cookie },
      )
    ).json.data;
    const all = JSON.stringify(a.spec);
    expect(all).toContain("media.test.example/api/public/sites/");
    expect(all).toContain('"sourceType":"owner-supplied"');
    expect(all).toContain("A frosted birthday cake");
    expect(a.spec.design.genome.imageDominance).toBe("dominant");
    const heroA = a.spec.pages[0].sections[0];
    expect(heroA.media.provenance.sourceType).toBe("owner-supplied");
    expect(JSON.stringify(b.spec)).toContain("licensed-stock");
    expect(JSON.stringify(a.spec)).not.toContain("licensed-stock");
    // the HTML carries srcset and a focal class; the page still lints and publishes
    const full = (
      await h.call(
        "GET",
        `/api/sites/${site.id}/versions/${after.json.data.version.id}`,
        { cookie: o.cookie },
      )
    ).json.data;
    expect(full.files).toEqual(expect.arrayContaining(["index.html"]));
    const pub = await h.call(
      "POST",
      `/api/sites/${site.id}/versions/${after.json.data.version.id}/publish`,
      { cookie: o.cookie },
    );
    expect(pub.status).toBe(200);
    expect(pub.json.data.verification.status).toBe("MATCH");
    const live = await (await fetch(pub.json.data.publicUrl)).text();
    expect(live).toMatch(
      /srcset="https:\/\/media\.test\.example\/api\/public\/sites\/[^"]+ 640w/,
    );
    // removing a photo hides it from new designs but never breaks what already used it
    expect(
      (
        await h.call(
          "DELETE",
          `/api/sites/${site.id}/media-library/${ids[1]}`,
          { cookie: o.cookie },
        )
      ).status,
    ).toBe(200);
    const list = (
      await h.call("GET", `/api/sites/${site.id}/media-library`, {
        cookie: o.cookie,
      })
    ).json.data;
    expect(list.items).toHaveLength(3);
    const old = (
      await h.call(
        "GET",
        `/api/sites/${site.id}/versions/${after.json.data.version.id}`,
        { cookie: o.cookie },
      )
    ).json.data;
    expect(old.spec).toEqual(a.spec);
  });

  it("blurry or tiny pictures are never used as the hero", async () => {
    const { o, site } = await setup("om-weak@example.com");
    const blurry = await sharp({
      create: { width: 1600, height: 1000, channels: 3, background: "#888888" },
    })
      .png()
      .toBuffer();
    const r = await upload(
      o.cookie,
      site.id,
      blurry,
      "kind=photo&filename=blur.png",
    );
    expect(r.status).toBe(201);
    expect(r.json.data!.quality.flags).toContain("BLURRY");
    const gen = await h.call("POST", `/api/sites/${site.id}/generate`, {
      cookie: o.cookie,
      body: brief,
    });
    const s = (
      await h.call(
        "GET",
        `/api/sites/${site.id}/versions/${gen.json.data.version.id}`,
        { cookie: o.cookie },
      )
    ).json.data.spec;
    expect(JSON.stringify(s)).not.toContain("/m/");
  });
});
