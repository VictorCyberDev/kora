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
}
export interface LlmClient {
  readonly model: string;
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
    this.endpoint = `${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  }
  async complete(req: LlmRequest, signal?: AbortSignal): Promise<LlmResponse> {
    const timeout = AbortSignal.timeout(this.cfg.timeoutMs ?? 30_000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let res: Response;
    try {
      res = await (this.cfg.fetchImpl ?? fetch)(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: this.cfg.model,
          temperature: 0,
          max_tokens: req.maxOutputTokens ?? this.cfg.maxOutputTokens ?? 1500,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
        }),
        signal: combined,
      });
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
/** Null when inference is not configured: callers fall back deterministically. */
export function llmFromEnv(env: InferenceEnv): LlmClient | null {
  if (!env.INFERENCE_BASE_URL || !env.INFERENCE_API_KEY || !env.INFERENCE_MODEL)
    return null;
  return new OpenAiCompatibleClient({
    baseUrl: env.INFERENCE_BASE_URL,
    apiKey: env.INFERENCE_API_KEY,
    model: env.INFERENCE_MODEL,
    ...(env.INFERENCE_TIMEOUT_MS
      ? { timeoutMs: Number(env.INFERENCE_TIMEOUT_MS) }
      : {}),
    ...(env.INFERENCE_MAX_OUTPUT_TOKENS
      ? { maxOutputTokens: Number(env.INFERENCE_MAX_OUTPUT_TOKENS) }
      : {}),
  });
}
