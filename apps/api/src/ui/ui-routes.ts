import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { PAGE_HTML, SCRIPT, STYLE } from "./page.js";

const hashOf = (text: string) =>
  `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

/**
 * Nothing but the page's own style and script (by hash) may load or run, and
 * the page may only talk to its own origin.
 */
const CSP = [
  "default-src 'none'",
  `style-src ${hashOf(STYLE)}`,
  `script-src ${hashOf(SCRIPT)}`,
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * GET /ui: one read-only evidence page (docs/architecture/evidence-ui.md).
 * The route reads no data; the page reads the API's existing JSON routes. The
 * API has no authentication, and neither does this page.
 */
export function registerUiRoutes(app: FastifyInstance): void {
  app.get("/ui", (_request, reply) =>
    reply
      .header("content-security-policy", CSP)
      .header("x-content-type-options", "nosniff")
      .header("cache-control", "no-store")
      .header("referrer-policy", "no-referrer")
      .header("x-frame-options", "DENY")
      .type("text/html; charset=utf-8")
      .send(PAGE_HTML),
  );
}
