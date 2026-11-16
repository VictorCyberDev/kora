import { describe, expect, it, vi } from "vitest";
import {
  FallbackLlmClient,
  LlmProviderError,
  LlmTransportError,
  type LlmClient,
} from "./llm.js";

const request = { system: "Follow the schema", user: "{}" };
const answer = {
  text: "{}",
  inputTokens: 1,
  outputTokens: 1,
  model: "fallback",
};

describe("quota-aware provider fallback", () => {
  it("falls back when a provider reaches a daily or minute limit and skips the cooled-down provider", async () => {
    const first = vi
      .fn()
      .mockRejectedValue(new LlmProviderError(429, 86_400_000));
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
    await expect(client.complete(request)).resolves.toMatchObject({
      provider: "gemini",
    });
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("selects a provider again after its cooldown expires", async () => {
    let now = 10_000;
    const first = vi
      .fn()
      .mockRejectedValueOnce(new LlmProviderError(429, 2_000))
      .mockResolvedValue({ ...answer, model: "primary" });
    const second = vi.fn().mockResolvedValue(answer);
    const client = new FallbackLlmClient(
      [
        { model: "primary", provider: "openrouter", complete: first },
        { model: "fallback", provider: "gemini", complete: second },
      ],
      () => now,
    );
    expect((await client.complete(request)).provider).toBe("gemini");
    now += 2_001;
    expect((await client.complete(request)).provider).toBe("openrouter");
  });

  it("retries a transient transport failure once, then fails over", async () => {
    const first = vi.fn().mockRejectedValue(new LlmTransportError());
    const second = vi.fn().mockResolvedValue(answer);
    const client = new FallbackLlmClient([
      { model: "first", provider: "nvidia", complete: first },
      { model: "fallback", provider: "gemini", complete: second },
    ]);
    expect((await client.complete(request)).provider).toBe("gemini");
    expect(first).toHaveBeenCalledTimes(2);
  });

  it("fails closed with a clear message when every provider is unavailable", async () => {
    const down = vi.fn().mockRejectedValue(new LlmProviderError(503, null));
    const client = new FallbackLlmClient([
      { model: "first", provider: "openrouter", complete: down },
    ]);
    await expect(client.complete(request)).rejects.toThrow(
      /all inference providers failed or unavailable/,
    );
  });

  it("enforces tenant and global request budgets before provider spend", async () => {
    const complete = vi.fn().mockResolvedValue(answer);
    const client = new FallbackLlmClient(
      [{ model: "one", provider: "openrouter", complete }],
      () => 60_000,
      { tenantRequestsPerMinute: 1, globalRequestsPerMinute: 2 },
    );
    await client.complete({ ...request, tenantId: "tenant-a" });
    await expect(
      client.complete({ ...request, tenantId: "tenant-a" }),
    ).rejects.toThrow(/tenant inference quota reached/);
    await client.complete({ ...request, tenantId: "tenant-b" });
    await expect(
      client.complete({ ...request, tenantId: "tenant-c" }),
    ).rejects.toThrow(/global inference quota reached/);
    expect(complete).toHaveBeenCalledTimes(2);
  });
});
