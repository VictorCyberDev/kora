import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./test-support/platform-harness.js";

const enabled = Boolean(process.env.DATABASE_URL);
const d = enabled ? describe : describe.skip;

type Mode = "good" | "hostile" | "down" | "garbage";
let mode: Mode = "good";
let calls: Array<{ system: string; user: string }> = [];
let h: Harness;
beforeAll(async () => {
  if (!enabled) return;
  h = await startHarness({
    env: { KORA_CREATIVE_ENGINE: "v3", KORA_MODEL_COMPOSE: "true" },
    llm: {
      model: "stub-model",
      provider: "stub",
      // eslint-disable-next-line @typescript-eslint/require-await -- the LLM interface is async; the stub has nothing to await
      complete: async (req) => {
        calls.push({ system: req.system, user: req.user });
        if (mode === "down") throw new Error("provider unavailable");
        if (mode === "garbage")
          return {
            text: "I am a helpful assistant and here is a poem",
            inputTokens: 100,
            outputTokens: 20,
            model: "stub-model",
          };
        const fields = JSON.parse(req.user.split("FIELDS:\n")[1]!) as Array<{
          id: string;
          kind: string;
        }>;
        const story = fields.find((f) => f.kind === "story paragraph")!;
        const answer = fields.find((f) => f.kind === "answer")!;
        return {
          text: JSON.stringify({
            edits:
              mode === "good"
                ? [
                    {
                      id: story.id,
                      text: "We bake cakes and small chops for birthdays and gatherings, shaped around what you are celebrating.",
                    },
                    {
                      id: answer.id,
                      text: "Tell us the date, how many people and the flavours you like, and we will reply with what is possible.",
                    },
                  ]
                : [
                    {
                      id: story.id,
                      text: "Our award-winning bakers guarantee delivery within 2 hours across Lagos.",
                    },
                    {
                      id: answer.id,
                      text: "Cakes start from N5,000, as praised by Ada Obi.",
                    },
                  ],
          }),
          inputTokens: 1200,
          outputTokens: 300,
          model: "stub-model",
        };
      },
    },
  });
});
afterAll(async () => {
  if (enabled) await h.close();
});

const generate = async (email: string) => {
  const o = await h.signup(email);
  const site = (
    await h.call("POST", "/api/sites", {
      cookie: o.cookie,
      body: { orgId: o.orgId, name: "Sweet Crumbs Bakery" },
    })
  ).json.data;
  const r = await h.call("POST", `/api/sites/${site.id}/generate`, {
    cookie: o.cookie,
    body: {
      name: "Sweet Crumbs Bakery",
      description: "I bake cakes and small chops.",
    },
  });
  const spec = (
    await h.call(
      "GET",
      `/api/sites/${site.id}/versions/${r.json.data.version.id}`,
      { cookie: o.cookie },
    )
  ).json.data.spec;
  return { o, site, r, spec };
};

d("model-assisted composition through the real API", () => {
  it("uses validated model copy, records tokens and usage, and the site is still complete", async () => {
    mode = "good";
    calls = [];
    const { r, spec, o } = await generate("compose-good@example.com");
    expect(r.status).toBe(201);
    expect(r.json.data.source).toBe("MODEL");
    expect(JSON.stringify(spec)).toContain(
      "shaped around what you are celebrating",
    );
    expect(spec.pages.length).toBe(6);
    expect(r.json.data.note ?? JSON.stringify(r.json.data)).toMatch(
      /AI rewrote 2 pieces/,
    );
    expect(calls).toHaveLength(1); // one bounded call per generation, not per preview or per section
    const usage = (
      await h.call("GET", `/api/orgs/${o.orgId}/usage`, { cookie: o.cookie })
    ).json.data;
    expect(JSON.stringify(usage)).toMatch(/AI_INPUT_TOKENS|1200/);
  });

  it("previews of the three directions stay deterministic and spend no model call", async () => {
    mode = "good";
    calls = [];
    const o = await h.signup("compose-preview@example.com");
    const r = await h.call("POST", "/api/design/directions", {
      cookie: o.cookie,
      body: {
        orgId: o.orgId,
        name: "Sweet Crumbs Bakery",
        description: "I bake cakes and small chops.",
      },
    });
    expect(r.status).toBe(200);
    expect(r.json.data).toHaveLength(3);
    expect(calls).toHaveLength(0);
  });

  it("a hostile or fabricating model changes nothing: the deterministic copy stays and the owner is told", async () => {
    mode = "hostile";
    const { r, spec } = await generate("compose-hostile@example.com");
    expect(r.status).toBe(201);
    expect(r.json.data.source).toBe("DETERMINISTIC");
    expect(JSON.stringify(spec)).not.toMatch(
      /award-winning|N5,000|Ada Obi|guarantee/i,
    );
    expect(JSON.stringify(r.json.data)).toMatch(/was not used/);
  });

  it("with the model down, or answering nonsense, a complete multipage site is still produced", async () => {
    for (const m of ["down", "garbage"] as const) {
      mode = m;
      const { r, spec } = await generate(`compose-${m}@example.com`);
      expect(r.status, m).toBe(201);
      expect(spec.pages.length, m).toBe(6);
      expect(r.json.data.source, m).toBe("DETERMINISTIC");
    }
  });

  it("the prompt carries the owner's words as delimited data and no secrets", async () => {
    mode = "good";
    calls = [];
    await generate("compose-prompt@example.com");
    expect(calls[0]!.user).toContain("<<<OWNER_WORDS");
    expect(calls[0]!.system).toMatch(/Never state or imply: prices/);
    expect(calls[0]!.user).not.toMatch(/password|api[_-]?key|secret/i);
  });
});
