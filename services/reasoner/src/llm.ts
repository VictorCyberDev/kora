/** Provider-neutral chat completion. Implementations never log credentials. */
export interface LlmRequest {
  system: string;
  /** Untrusted-data-bearing user message (JSON). */
  user: string;
  maxOutputTokens?: number;
}
export interface LlmResponse {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
  model: string;
  /** Which configured provider answered (label only; never a credential). */
  provider?: string;
}
export interface LlmClient {
  readonly model: string;
  /** Human label of the provider, for logs and the UI. */
  readonly provider?: string;
  complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmResponse>;
}
export class LlmUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

export interface OpenAiCompatibleConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  fetchImpl?: typeof fetch;
}

/** Any OpenAI-compatible `/chat/completions` endpoint (RumptyCloud hosted inference included). */
export class OpenAiCompatibleClient implements LlmClient {
  readonly model: string;
  private readonly endpoint: string;
  constructor(private readonly cfg: OpenAiCompatibleConfig) {
    this.model = cfg.model;
    // Accept either the API base ("https://host/v1") or the full completions URL.
    const base = cfg.baseUrl.replace(/\/+$/, "");
    this.endpoint = base.endsWith("/chat/completions")
      ? base
      : `${base}/chat/completions`;
  }
  async complete(req: LlmRequest, signal?: AbortSignal): Promise<LlmResponse> {
    const timeout = AbortSignal.timeout(this.cfg.timeoutMs ?? 30_000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const send = (jsonMode: boolean) =>
      (this.cfg.fetchImpl ?? fetch)(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: this.cfg.model,
          temperature: 0,
          max_tokens: req.maxOutputTokens ?? this.cfg.maxOutputTokens ?? 1500,
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
        }),
        signal: combined,
      });
    let res: Response;
    try {
      res = await send(true);
      // Some hosted models reject response_format; the prompt already demands
      // JSON and the output is validated either way, so retry once without it.
      if (res.status === 400 || res.status === 422) res = await send(false);
    } catch (error) {
      // Message only: the request (and its Authorization header) is never attached.
      throw new LlmUnavailableError(
        `inference request failed: ${error instanceof Error ? error.name : "error"}`,
      );
    }
    if (!res.ok)
      throw new LlmUnavailableError(`inference returned HTTP ${res.status}`);
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new LlmUnavailableError("inference returned a non-JSON body");
    }
    const b = body as {
      choices?: Array<{ message?: { content?: unknown } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = b.choices?.[0]?.message?.content;
    if (typeof text !== "string")
      throw new LlmUnavailableError("inference returned no content");
    return {
      text,
      inputTokens: b.usage?.prompt_tokens ?? null,
      outputTokens: b.usage?.completion_tokens ?? null,
      model: this.cfg.model,
    };
  }
}

export interface InferenceEnv {
  INFERENCE_BASE_URL?: string | undefined;
  INFERENCE_API_KEY?: string | undefined;
  INFERENCE_MODEL?: string | undefined;
  INFERENCE_TIMEOUT_MS?: string | undefined;
  INFERENCE_MAX_OUTPUT_TOKENS?: string | undefined;
}
/**
 * Provider-neutral configuration. Any OpenAI-compatible endpoint works
 * (RumptyCloud Inference, OpenRouter, Cloudflare Workers AI, Gemini's
 * OpenAI-compatible endpoint, ...). AI_* wins; INFERENCE_* stays valid.
 * AI_FALLBACK_n_* (n = 1..3) are tried in order when the primary is down.
 */
export interface AiEnv extends InferenceEnv {
  AI_PROVIDER?: string | undefined;
  AI_BASE_URL?: string | undefined;
  AI_API_KEY?: string | undefined;
  AI_MODEL?: string | undefined;
  AI_TIMEOUT_MS?: string | undefined;
  AI_MAX_OUTPUT_TOKENS?: string | undefined;
  AI_FALLBACK_1_PROVIDER?: string | undefined;
  AI_FALLBACK_1_BASE_URL?: string | undefined;
  AI_FALLBACK_1_API_KEY?: string | undefined;
  AI_FALLBACK_1_MODEL?: string | undefined;
  AI_FALLBACK_2_PROVIDER?: string | undefined;
  AI_FALLBACK_2_BASE_URL?: string | undefined;
  AI_FALLBACK_2_API_KEY?: string | undefined;
  AI_FALLBACK_2_MODEL?: string | undefined;
  AI_FALLBACK_3_PROVIDER?: string | undefined;
  AI_FALLBACK_3_BASE_URL?: string | undefined;
  AI_FALLBACK_3_API_KEY?: string | undefined;
  AI_FALLBACK_3_MODEL?: string | undefined;
}

/** Tries each provider in order, one retry on a transient failure, and labels who answered. */
export class FallbackLlmClient implements LlmClient {
  readonly model: string;
  readonly provider: string;
  constructor(private readonly clients: LlmClient[]) {
    if (clients.length === 0) throw new Error("at least one client");
    this.model = clients[0]!.model;
    this.provider = clients[0]!.provider ?? "primary";
  }
  async complete(req: LlmRequest, signal?: AbortSignal): Promise<LlmResponse> {
    const failures: string[] = [];
    for (const c of this.clients) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await c.complete(req, signal);
          return { ...r, provider: c.provider ?? r.provider ?? "unlabelled" };
        } catch (error) {
          if (signal?.aborted) throw error;
          failures.push(
            `${c.provider ?? c.model}: ${error instanceof Error ? error.message : "error"}`,
          );
          // A rejected key or model will not improve on retry.
          if (/HTTP (401|403|404)/.test(failures.at(-1)!)) break;
        }
      }
    }
    throw new LlmUnavailableError(
      `all inference providers failed (${failures.join("; ")})`,
    );
  }
}

function one(
  provider: string,
  baseUrl?: string,
  apiKey?: string,
  model?: string,
  timeout?: string,
  max?: string,
): LlmClient | null {
  if (!baseUrl || !apiKey || !model) return null;
  const c = new OpenAiCompatibleClient({
    baseUrl,
    apiKey,
    model,
    ...(timeout ? { timeoutMs: Number(timeout) } : {}),
    ...(max ? { maxOutputTokens: Number(max) } : {}),
  });
  return Object.assign(c, { provider });
}

/** Null when no provider is configured: callers fall back deterministically. */
export function llmFromEnv(env: AiEnv): LlmClient | null {
  const timeout = env.AI_TIMEOUT_MS ?? env.INFERENCE_TIMEOUT_MS;
  const max = env.AI_MAX_OUTPUT_TOKENS ?? env.INFERENCE_MAX_OUTPUT_TOKENS;
  const chain = [
    one(
      env.AI_PROVIDER ?? "primary",
      env.AI_BASE_URL ?? env.INFERENCE_BASE_URL,
      env.AI_API_KEY ?? env.INFERENCE_API_KEY,
      env.AI_MODEL ?? env.INFERENCE_MODEL,
      timeout,
      max,
    ),
    one(
      env.AI_FALLBACK_1_PROVIDER ?? "fallback-1",
      env.AI_FALLBACK_1_BASE_URL,
      env.AI_FALLBACK_1_API_KEY,
      env.AI_FALLBACK_1_MODEL,
      timeout,
      max,
    ),
    one(
      env.AI_FALLBACK_2_PROVIDER ?? "fallback-2",
      env.AI_FALLBACK_2_BASE_URL,
      env.AI_FALLBACK_2_API_KEY,
      env.AI_FALLBACK_2_MODEL,
      timeout,
      max,
    ),
    one(
      env.AI_FALLBACK_3_PROVIDER ?? "fallback-3",
      env.AI_FALLBACK_3_BASE_URL,
      env.AI_FALLBACK_3_API_KEY,
      env.AI_FALLBACK_3_MODEL,
      timeout,
      max,
    ),
  ].filter((c): c is LlmClient => c !== null);
  if (chain.length === 0) return null;
  return chain.length === 1 ? chain[0]! : new FallbackLlmClient(chain);
}
