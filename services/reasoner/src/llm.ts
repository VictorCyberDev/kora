/** Provider-neutral chat completion. Implementations never log credentials. */
export interface LlmRequest {
  system: string;
  /** Untrusted-data-bearing user message (JSON). */
  user: string;
  maxOutputTokens?: number;
  /** Routing hint only. It is never sent to a provider. */
  task?:
    | "structured_website_spec"
    | "creative_brief"
    | "marketing_copy"
    | "brand_identity"
    | "design_critique"
    | "image_understanding"
    | "json_repair"
    | "customer_safe_summary"
    | "incident_reasoning";
  /** Tenant key for quota accounting. It is never sent to a provider. */
  tenantId?: string;
}
export interface LlmResponse {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
  model: string;
  /** Which configured provider answered (label only; never a credential). */
  provider?: string;
  /** End-to-end provider latency, excluding fallback attempts. */
  latencyMs?: number;
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

/** A provider backoff signal. Do not attach raw responses or request credentials. */
export class LlmProviderError extends LlmUnavailableError {
  constructor(
    readonly status: number,
    readonly retryAfterMs: number | null,
  ) {
    super(`inference returned HTTP ${status}`);
  }
}

/** A retryable network, timeout or gateway transport failure. */
export class LlmTransportError extends LlmUnavailableError {
  constructor(readonly retryAfterMs = 1_000) {
    super("inference request failed: transport unavailable");
  }
}

function backoffMs(headers: Headers, now = Date.now()): number | null {
  const retry = headers.get("retry-after");
  if (retry) {
    const secs = Number(retry);
    const until = Number.isFinite(secs) ? secs * 1000 : Date.parse(retry) - now;
    if (Number.isFinite(until))
      return Math.max(1000, Math.min(until, 86_400_000));
  }
  const reset = headers.get("x-ratelimit-reset");
  if (reset) {
    const value = Number(reset);
    const until = Number.isFinite(value)
      ? value * (value < 1e12 ? 1000 : 1) - now
      : Date.parse(reset) - now;
    if (Number.isFinite(until))
      return Math.max(1000, Math.min(until, 86_400_000));
  }
  return null;
}

export interface OpenAiCompatibleConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  fetchImpl?: typeof fetch;
  /** Bounds simultaneous requests sent to one provider credential. */
  maxConcurrent?: number;
}

/** Any OpenAI-compatible `/chat/completions` endpoint (RumptyCloud hosted inference included). */
export class OpenAiCompatibleClient implements LlmClient {
  readonly model: string;
  private readonly endpoint: string;
  private active = 0;
  private readonly waiters: Array<() => void> = [];
  constructor(private readonly cfg: OpenAiCompatibleConfig) {
    this.model = cfg.model;
    // Accept either the API base ("https://host/v1") or the full completions URL.
    const base = cfg.baseUrl.replace(/\/+$/, "");
    this.endpoint = base.endsWith("/chat/completions")
      ? base
      : `${base}/chat/completions`;
  }
  private async acquire(signal?: AbortSignal) {
    const limit = Math.max(1, Math.floor(this.cfg.maxConcurrent ?? 2));
    if (this.active < limit) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const enter = () => {
        signal?.removeEventListener("abort", abort);
        this.active += 1;
        resolve();
      };
      const abort = () => {
        const index = this.waiters.indexOf(enter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(
          signal?.reason instanceof Error
            ? signal.reason
            : new DOMException("Aborted", "AbortError"),
        );
      };
      this.waiters.push(enter);
      signal?.addEventListener("abort", abort, { once: true });
    });
  }
  private release() {
    this.active = Math.max(0, this.active - 1);
    this.waiters.shift()?.();
  }
  async complete(req: LlmRequest, signal?: AbortSignal): Promise<LlmResponse> {
    await this.acquire(signal);
    const startedAt = Date.now();
    try {
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
        if (signal?.aborted) throw error;
        throw new LlmTransportError();
      }
      if (!res.ok)
        throw new LlmProviderError(res.status, backoffMs(res.headers));
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
        latencyMs: Date.now() - startedAt,
      };
    } finally {
      this.release();
    }
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
  AI_MAX_CONCURRENT?: string | number | undefined;
  AI_TENANT_REQUESTS_PER_MINUTE?: string | number | undefined;
  AI_GLOBAL_REQUESTS_PER_MINUTE?: string | number | undefined;
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

/** Quota-aware fallback. Cooldowns are per provider instance and reset on process restart.
 * For multi-instance production, move cooldown records to a shared Redis/Postgres lease.
 */
export class FallbackLlmClient implements LlmClient {
  readonly model: string;
  readonly provider: string;
  private readonly unavailableUntil = new Map<LlmClient, number>();
  private globalWindow = { minute: -1, count: 0 };
  private readonly tenantWindows = new Map<
    string,
    { minute: number; count: number }
  >();
  constructor(
    private readonly clients: LlmClient[],
    private readonly now: () => number = Date.now,
    private readonly quotas: {
      tenantRequestsPerMinute?: number;
      globalRequestsPerMinute?: number;
    } = {},
  ) {
    if (clients.length === 0) throw new Error("at least one client");
    this.model = clients[0]!.model;
    this.provider = clients[0]!.provider ?? "primary";
  }
  private consumeQuota(tenantId?: string) {
    const minute = Math.floor(this.now() / 60_000);
    if (this.globalWindow.minute !== minute)
      this.globalWindow = { minute, count: 0 };
    const globalLimit = this.quotas.globalRequestsPerMinute;
    if (globalLimit && this.globalWindow.count >= globalLimit)
      throw new LlmUnavailableError(
        "global inference quota reached; retry next minute",
      );
    if (tenantId) {
      const current = this.tenantWindows.get(tenantId);
      const window =
        current?.minute === minute ? current : { minute, count: 0 };
      const tenantLimit = this.quotas.tenantRequestsPerMinute;
      if (tenantLimit && window.count >= tenantLimit)
        throw new LlmUnavailableError(
          "tenant inference quota reached; retry next minute",
        );
      window.count += 1;
      this.tenantWindows.set(tenantId, window);
    }
    this.globalWindow.count += 1;
  }
  async complete(req: LlmRequest, signal?: AbortSignal): Promise<LlmResponse> {
    this.consumeQuota(req.tenantId);
    const failures: string[] = [];
    for (const c of this.clients) {
      if ((this.unavailableUntil.get(c) ?? 0) > this.now()) continue;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await c.complete(req, signal);
          this.unavailableUntil.delete(c);
          return { ...r, provider: c.provider ?? r.provider ?? "unlabelled" };
        } catch (error) {
          if (signal?.aborted) throw error;
          const name = c.provider ?? c.model;
          const status =
            error instanceof LlmProviderError ? error.status : null;
          failures.push(
            `${name}: ${error instanceof Error ? error.message : "error"}`,
          );
          if (
            status === 429 ||
            status === 402 ||
            status === 403 ||
            status === 401
          ) {
            // Retry-After / X-RateLimit-Reset can cover daily quotas.
            // Without provider guidance, use a cautious bounded cooldown.
            const fallback = status === 429 ? 60_000 : 86_400_000;
            this.unavailableUntil.set(
              c,
              this.now() +
                (error instanceof LlmProviderError
                  ? (error.retryAfterMs ?? fallback)
                  : fallback),
            );
            break;
          }
          if (status === 400 || status === 404 || status === 422) {
            // A bad request or invalid model identifier will not recover on retry.
            this.unavailableUntil.set(c, this.now() + 6 * 3_600_000);
            break;
          }
          // Only retry transient gateway errors and network failures; never duplicate
          // on ambiguous errors where a provider may have processed a billed request.
          if (
            !(error instanceof LlmTransportError) &&
            ![502, 503, 504].includes(status ?? 0)
          )
            break;
          if (attempt === 1)
            this.unavailableUntil.set(
              c,
              this.now() +
                (error instanceof LlmTransportError
                  ? error.retryAfterMs
                  : 30_000),
            );
        }
      }
    }
    throw new LlmUnavailableError(
      `all inference providers failed or unavailable (${failures.join("; ") || "cooldown active"})`,
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
  maxConcurrent?: string | number,
): LlmClient | null {
  if (!baseUrl || !apiKey || !model) return null;
  const c = new OpenAiCompatibleClient({
    baseUrl,
    apiKey,
    model,
    ...(timeout ? { timeoutMs: Number(timeout) } : {}),
    ...(max ? { maxOutputTokens: Number(max) } : {}),
    ...(maxConcurrent ? { maxConcurrent: Number(maxConcurrent) } : {}),
  });
  return Object.assign(c, { provider });
}

/** Null when no provider is configured: callers fall back deterministically. */
export function llmFromEnv(env: AiEnv): LlmClient | null {
  const timeout = env.AI_TIMEOUT_MS ?? env.INFERENCE_TIMEOUT_MS;
  const max = env.AI_MAX_OUTPUT_TOKENS ?? env.INFERENCE_MAX_OUTPUT_TOKENS;
  const maxConcurrent = env.AI_MAX_CONCURRENT;
  const chain = [
    one(
      env.AI_PROVIDER ?? "primary",
      env.AI_BASE_URL ?? env.INFERENCE_BASE_URL,
      env.AI_API_KEY ?? env.INFERENCE_API_KEY,
      env.AI_MODEL ?? env.INFERENCE_MODEL,
      timeout,
      max,
      maxConcurrent,
    ),
    one(
      env.AI_FALLBACK_1_PROVIDER ?? "fallback-1",
      env.AI_FALLBACK_1_BASE_URL,
      env.AI_FALLBACK_1_API_KEY,
      env.AI_FALLBACK_1_MODEL,
      timeout,
      max,
      maxConcurrent,
    ),
    one(
      env.AI_FALLBACK_2_PROVIDER ?? "fallback-2",
      env.AI_FALLBACK_2_BASE_URL,
      env.AI_FALLBACK_2_API_KEY,
      env.AI_FALLBACK_2_MODEL,
      timeout,
      max,
      maxConcurrent,
    ),
    one(
      env.AI_FALLBACK_3_PROVIDER ?? "fallback-3",
      env.AI_FALLBACK_3_BASE_URL,
      env.AI_FALLBACK_3_API_KEY,
      env.AI_FALLBACK_3_MODEL,
      timeout,
      max,
      maxConcurrent,
    ),
  ].filter((c): c is LlmClient => c !== null);
  if (chain.length === 0) return null;
  const tenantRequestsPerMinute = Number(
    env.AI_TENANT_REQUESTS_PER_MINUTE ?? 0,
  );
  const globalRequestsPerMinute = Number(
    env.AI_GLOBAL_REQUESTS_PER_MINUTE ?? 0,
  );
  const quotas = {
    ...(tenantRequestsPerMinute > 0 ? { tenantRequestsPerMinute } : {}),
    ...(globalRequestsPerMinute > 0 ? { globalRequestsPerMinute } : {}),
  };
  if (chain.length === 1 && Object.keys(quotas).length === 0) return chain[0]!;
  return new FallbackLlmClient(chain, Date.now, quotas);
}
