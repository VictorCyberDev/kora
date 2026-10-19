import { JSDOM } from "jsdom";
import { buildApi } from "../app.js";
import type { KoraStore } from "../store.js";

// Claims the page must never make. Assembled from fragments so no source or
// test file contains the phrases themselves.
const PARTS = [
  ["tamper", "-", "proof"],
  ["at", "tested"],
  ["pro", "ven"],
  ["se", "cure"],
  ["verified", " ", "deployment"],
];
export const FORBIDDEN_SAMPLES = PARTS.map((p) => p.join(""));
export const FORBIDDEN = new RegExp(
  PARTS.map((p) => `\\b${p.join("").replace(/[- ]/, "[- ]?")}\\b`).join("|"),
  "i",
);

export type Reply = { status?: number; body?: unknown } | "network-error";
export interface Request {
  url: string;
  method: string;
}

/** The page exactly as GET /ui serves it. The route reads nothing. */
export async function uiResponse() {
  const untouchable = new Proxy(
    {},
    {
      get: (_target, prop) => {
        throw new Error(`store.${String(prop)} must not be used by /ui`);
      },
    },
  ) as unknown as KoraStore;
  const app = buildApi(untouchable, "test");
  const response = await app.inject("/ui");
  await app.close();
  return response;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Loads the served page in jsdom and RUNS its embedded script. `fetch` is the
 * only thing replaced: it answers from `routes` and records every request.
 */
export async function openUi(options: {
  routes: (url: string) => Reply;
  hash?: string;
}) {
  const html = (await uiResponse()).body;
  const requests: Request[] = [];
  const errors: string[] = [];
  let xhr = 0;
  const dom = new JSDOM(html, {
    url: `http://kora.test/ui${options.hash ?? ""}`,
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      const w = window as unknown as Record<string, unknown>;
      w.fetch = (input: unknown, init?: { method?: string }) => {
        const url = String(input);
        requests.push({ url, method: init?.method ?? "GET" });
        const reply = options.routes(url);
        if (reply === "network-error")
          return Promise.reject(new TypeError("Failed to fetch"));
        const status = reply.status ?? 200;
        return Promise.resolve({
          ok: status >= 200 && status < 300,
          status,
          json: () =>
            reply.body === undefined
              ? Promise.reject(new SyntaxError("Unexpected end of JSON input"))
              : Promise.resolve(structuredClone(reply.body)),
        });
      };
      const Original = window.XMLHttpRequest;
      w.XMLHttpRequest = function (this: unknown) {
        xhr++;
        return new Original();
      };
      window.addEventListener("error", (e) => errors.push(e.message));
    },
  });
  const { window } = dom;
  const page = {
    window,
    document: window.document,
    requests,
    errors,
    xhrCount: () => xhr,
    close: () => window.close(),
    /** Waits until no request is outstanding. */
    async settle() {
      for (let i = 0; i < 400; i++) {
        const app = window.document.getElementById("app");
        if (app?.getAttribute("aria-busy") === "false") {
          await sleep(5);
          if (app.getAttribute("aria-busy") === "false") return;
        }
        await sleep(5);
      }
      throw new Error("the page never finished loading");
    },
  };
  await page.settle();
  return page;
}
export type Page = Awaited<ReturnType<typeof openUi>>;
