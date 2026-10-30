/**
 * On-device AI through Chrome's built-in Prompt API (Gemini Nano). Everything here is optional:
 * it never throws to callers, never blocks generation, and its output is only ever *text that
 * Kora's server validates* exactly like a remote model's. It has no authority over publishing,
 * versions or recovery.
 */
type LM = {
  availability(
    o?: unknown,
  ): Promise<"unavailable" | "downloadable" | "downloading" | "available">;
  create(o?: unknown): Promise<{
    prompt(input: string, o?: unknown): Promise<string>;
    destroy(): void;
  }>;
};
const lm = (): LM | null =>
  typeof globalThis !== "undefined" && "LanguageModel" in globalThis
    ? ((globalThis as unknown as { LanguageModel: LM }).LanguageModel as LM)
    : null;

export type LocalAiState =
  "unsupported" | "unavailable" | "downloadable" | "downloading" | "available";
const OPTS = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

export async function localAiState(): Promise<LocalAiState> {
  const api = lm();
  if (!api) return "unsupported";
  try {
    return await api.availability(OPTS);
  } catch {
    return "unavailable";
  }
}

/**
 * Asks the on-device model for a design direction. Returns the raw model text (to be sent to Kora
 * for validation) or null when anything at all goes wrong. `schema` is Kora's own answer schema.
 */
export async function runLocalDesign(
  brief: Record<string, unknown>,
  intelligence: { prompt: string; schema: unknown },
  opts: { timeoutMs?: number; onDownload?: (fraction: number) => void } = {},
): Promise<{ text: string; provider: string } | null> {
  const api = lm();
  if (!api) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
  let session: Awaited<ReturnType<LM["create"]>> | null = null;
  try {
    session = await api.create({
      ...OPTS,
      signal: controller.signal,
      initialPrompts: [{ role: "system", content: intelligence.prompt }],
      monitor(m: EventTarget) {
        m.addEventListener("downloadprogress", (e) =>
          opts.onDownload?.((e as ProgressEvent).loaded),
        );
      },
    });
    const text = await session.prompt(JSON.stringify({ brief }), {
      responseConstraint: intelligence.schema,
      signal: controller.signal,
    });
    return typeof text === "string" && text.length > 2
      ? { text, provider: "on-device" }
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    try {
      session?.destroy();
    } catch {
      /* already gone */
    }
  }
}
