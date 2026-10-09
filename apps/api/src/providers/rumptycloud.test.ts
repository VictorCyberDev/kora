import { describe, expect, it } from "vitest";
import {
  normalizeProviderError,
  redactProviderText,
  RumptyCloudProvider,
} from "./rumptycloud.js";

const resource = {
  workspace: "kora",
  region: "lagos",
  resourceType: "virtual_machine" as const,
  resourceId: "vm-123",
  displayName: "kora-demo",
  environment: "hacktober",
  publicUrl: "https://demo.example.test",
  healthPath: "/health",
};

describe("RumptyCloud provider contract", () => {
  it("uses stable provider resource identity rather than display name", () => {
    const provider = new RumptyCloudProvider();
    const first = provider.normalizeResource(resource);
    const renamed = provider.normalizeResource({ ...resource, displayName: "renamed" });
    expect(first.providerResourceId).toBe(renamed.providerResourceId);
    expect(first.providerAccount).toBe(renamed.providerAccount);
  });

  it("advertises only the capability actually implemented", () => {
    const capabilities = new RumptyCloudProvider().capabilities;
    expect([...capabilities]).toEqual(["HEALTH_OBSERVATION"]);
    expect(capabilities.has("RESOURCE_DISCOVERY")).toBe(false);
    expect(capabilities.has("RESTART")).toBe(false);
  });

  it("maps documented VM identity into provider-neutral fields", () => {
    const mapped = new RumptyCloudProvider().normalizeResource(resource);
    expect(mapped).toMatchObject({
      provider: "rumptycloud",
      providerAccount: "kora",
      region: "lagos",
      resourceType: "virtual_machine",
      providerResourceId: "vm-123",
      environment: "hacktober",
    });
  });

  it("rejects malformed resource identity", () => {
    expect(() =>
      new RumptyCloudProvider().normalizeResource({ ...resource, resourceId: "" }),
    ).toThrow();
  });

  it("keeps only allow-listed non-secret metadata", () => {
    const mapped = new RumptyCloudProvider().normalizeResource(resource);
    expect(mapped.metadata).toEqual({
      publicUrl: "https://demo.example.test",
      healthPath: "/health",
    });
  });

  it("normalizes authentication failures without provider response details", () => {
    const error = normalizeProviderError(new Error("401 token=rmp_live_secret"));
    expect(error.code).toBe("AUTHENTICATION_FAILED");
    expect(error.message).not.toContain("rmp_live_secret");
    expect(error.retryable).toBe(false);
  });

  it("normalizes rate limiting as retryable", () => {
    const error = normalizeProviderError(new Error("429 rate limit"));
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.retryable).toBe(true);
  });

  it("normalizes network/provider unavailability separately from workload health", () => {
    const error = normalizeProviderError(new Error("network timeout"));
    expect(error.code).toBe("PROVIDER_UNAVAILABLE");
    expect(error.retryable).toBe(true);
  });

  it("normalizes unknown resources", () => {
    const error = normalizeProviderError(new Error("404 resource not found"));
    expect(error.code).toBe("UNKNOWN_RESOURCE");
  });

  it("redacts API keys and named secret fields", () => {
    const text = redactProviderText(
      "token=rmp_live_supersecret password=hunter2 authorization=Bearer123",
    );
    expect(text).not.toContain("supersecret");
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("Bearer123");
  });
});
