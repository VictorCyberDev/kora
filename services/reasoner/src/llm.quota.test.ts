import { describe, expect, it, vi } from "vitest";
import { FallbackLlmClient, LlmProviderError, type LlmClient } from "./llm.js";

const request = { system: "Follow the schema", user: "{}" };
const answer = { text: "{}", inputTokens: 1, outputTokens: 1, model: "fallback" };

describe("quota-aware provider fallback", () => {
  it("falls back when a provider reaches a daily or minute limit and skips the cooled-down provider", async () => {
    const first = vi.fn().mockRejectedValue(new LlmProviderError(429, 86_400_000));
    const second = vi.fn().mockResolvedValue(answer);
    const providers: LlmClient[] = [
      { model: "first", provider: "openrouter", complete: first },
      { model: "fallback", provider: "gemini", complete: second },
    ];
    const client = new FallbackLlmClient(providers);
    expect((await client.complete(request)).provider).toBe("gemini");
    expect((await client.complete(request)).provider).toBe("gemini");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("falls back when credits are exhausted", async () => {
    const first = vi.fn().mockRejectedValue(new LlmProviderError(402, null));
    const second = vi.fn().mockResolvedValue(answer);
    const client = new FallbackLlmClient([
      { model: "first", provider: "nvidia", complete: first },
      { model: "fallback", provider: "openrouter", complete: second },
    ]);
    expect((await client.complete(request)).provider).toBe("openrouter");
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("does not retry non-retryable authentication errors", async () => {
    const first = vi.fn().mockRejectedValue(new LlmProviderError(401, null));
    const second = vi.fn().mockResolvedValue(answer);
    const client = new FallbackLlmClient([
      { model: "first", provider: "openrouter", complete: first },
      { model: "fallback", provider: "gemini", complete: second },
    ]);
    await expect(client.complete(request)).resolves.toMatchObject({ provider: "gemini" });
    expect(first).toHaveBeenCalledTimes(1);
  });
});
