import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { buildApi } from "../app.js";
import {
  FORBIDDEN,
  FORBIDDEN_SAMPLES,
  uiResponse,
} from "../test-support/ui-harness.js";
import type { KoraStore } from "../store.js";

const sha256 = (text: string) =>
  `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

describe("GET /ui", () => {
  it("serves HTML with a strict CSP, nosniff and no-store", async () => {
    const r = await uiResponse();
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toMatch(/^text\/html/);
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["cache-control"]).toBe("no-store");
    const csp = String(r.headers["content-security-policy"]);
    const directives = Object.fromEntries(
      csp
        .split(";")
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => {
          const [name, ...values] = d.split(/\s+/);
          return [name, values];
        }),
    ) as Record<string, string[]>;
    expect(directives["default-src"]).toEqual(["'none'"]);
    expect(directives["connect-src"]).toEqual(["'self'"]);
    expect(directives["base-uri"]).toEqual(["'none'"]);
    expect(directives["form-action"]).toEqual(["'none'"]);
    expect(directives["frame-ancestors"]).toEqual(["'none'"]);
    expect(csp).not.toMatch(/unsafe-|\*|https?:|data:|blob:/);
    // Only the page's own style and script, by hash.
    const dom = new JSDOM(r.body);
    const style = dom.window.document.querySelector("style")!.textContent;
    const script = dom.window.document.querySelector("script")!.textContent;
    expect(directives["style-src"]).toEqual([sha256(style)]);
    expect(directives["script-src"]).toEqual([sha256(script)]);
  });

  it("is one self-contained document with no external reference", async () => {
    const { body } = await uiResponse();
    const doc = new JSDOM(body).window.document;
    expect(doc.querySelectorAll("script")).toHaveLength(1);
    expect(doc.querySelector("script")!.hasAttribute("src")).toBe(false);
    expect(doc.querySelectorAll("style")).toHaveLength(1);
    expect(
      doc.querySelectorAll(
        "link, img, iframe, frame, object, embed, base, form, input, button, select, textarea, audio, video, source, svg, meta[http-equiv]",
      ),
    ).toHaveLength(0);
    for (const element of doc.querySelectorAll("*")) {
      for (const attr of element.getAttributeNames()) {
        expect(attr, `${element.tagName}[${attr}]`).not.toMatch(/^on/i);
        expect(attr).not.toBe("style");
        expect(attr).not.toBe("srcdoc");
      }
    }
    expect(body).not.toMatch(/https?:\/\/|\/\/[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(body).not.toMatch(/@import|url\(/i);
  });

  it("contains no /dev reference and no forbidden word", async () => {
    const { body } = await uiResponse();
    expect(body).not.toMatch(/\/dev\b/i);
    expect(body).not.toMatch(FORBIDDEN);
  });

  it("states what it is, what it is not, and that there is no authentication", async () => {
    const { body } = await uiResponse();
    const doc = new JSDOM(body).window.document;
    const footer = doc.querySelector("footer")!.textContent;
    expect(footer).toMatch(/no authentication/i);
    expect(footer).toMatch(/read-only/i);
    const text = doc.body.textContent;
    expect(text).toContain("Deployment Verification (not cryptographic)");
    expect(text).toContain("Download Incident Passport");
    expect(text).toContain("pnpm kora:verify <file>");
    expect(text).toContain(
      "Integrity only: not signed, does not show who produced it",
    );
  });

  it("builds the DOM only with textContent", async () => {
    const { body } = await uiResponse();
    const script = new JSDOM(body).window.document.querySelector(
      "script",
    )!.textContent;
    for (const banned of [
      "innerHTML",
      "outerHTML",
      "insertAdjacentHTML",
      "document.write",
      "eval(",
      "new Function",
      'setAttribute("style"',
      "srcdoc",
      "XMLHttpRequest",
      "WebSocket",
      "EventSource",
      "sendBeacon",
      "import(",
      "importScripts",
      "createContextualFragment",
      "DOMParser",
    ])
      expect(script, banned).not.toContain(banned);
    expect(script).toContain("textContent");
  });

  it("works at 375px and in light and dark", async () => {
    const { body } = await uiResponse();
    const doc = new JSDOM(body).window.document;
    expect(
      doc.querySelector('meta[name="viewport"]')!.getAttribute("content"),
    ).toContain("width=device-width");
    const css = doc.querySelector("style")!.textContent;
    expect(css).toContain("prefers-color-scheme: dark");
    expect(css).toContain("color-scheme");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("overflow-wrap");
  });

  it("reads nothing from the store and offers no other method", async () => {
    const untouchable = new Proxy(
      {},
      {
        get: (_t, prop) => {
          throw new Error(`store.${String(prop)} must not be used`);
        },
      },
    ) as unknown as KoraStore;
    const app = buildApi(untouchable, "test");
    expect((await app.inject("/ui")).statusCode).toBe(200);
    expect((await app.inject("/ui?x=1")).statusCode).toBe(200);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const)
      expect((await app.inject({ method, url: "/ui" })).statusCode).toBe(404);
    expect((await app.inject("/dev/failure")).statusCode).toBe(404);
    await app.close();
  });
});

describe("terminology guard", () => {
  it("catches each forbidden word", () => {
    for (const word of FORBIDDEN_SAMPLES)
      expect(FORBIDDEN.test(word), word).toBe(true);
    expect(FORBIDDEN.test("integrity only, not signed")).toBe(false);
  });
  it("the UI sources and tests do not contain them", () => {
    const dir = new URL(".", import.meta.url);
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      const text = readFileSync(new URL(file, dir), "utf8");
      expect(text, file).not.toMatch(FORBIDDEN);
    }
  });
});
