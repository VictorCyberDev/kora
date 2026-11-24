import { describe, expect, it } from "vitest";
import { auditHtml } from "./discovery.js";

describe("public discovery audit evidence", () => {
  const html = (meta: string, language = 'lang="en"') =>
    `<!doctype html><html ${language}><head><title>Meridian Bakes Bakery Lagos</title>${meta}<meta name="viewport" content="width=device-width"></head><body><h1>Our bakery</h1></body></html>`;

  it("recognizes a real description regardless of HTML attribute order", () => {
    const description =
      "Meridian Bakes offers artisan bread, pastries and celebration cakes in Lagos.";
    const page = auditHtml(
      html(`<meta content="${description}" name="description">`),
      "https://meridian.example",
    );
    expect(page.findings.find((f) => f.id === "description")?.ok).toBe(true);
  });
  it("does not treat unrelated meta content or an empty language as verified", () => {
    const page = auditHtml(
      html(
        '<meta name="author" content="description and search optimization">',
        'lang=""',
      ),
      "https://meridian.example",
    );
    expect(page.findings.find((f) => f.id === "description")?.ok).toBe(false);
    expect(page.findings.find((f) => f.id === "lang")?.ok).toBe(false);
  });
});
