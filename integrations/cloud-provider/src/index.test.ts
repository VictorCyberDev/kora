import { describe, expect, it } from "vitest";
import { ProviderError, resourceIdentityKey, redactSecret } from "./index.js";
import { parseVmList, RumptyCloudProvider } from "./rumptycloud.js";
const identity = { provider: "rumptycloud", account: "kora-test", region: "lagos-1", resourceType: "virtual_machine" as const, providerResourceId: "vm_123" };
describe("provider contract", () => {
  it("builds stable identity from provider scope", () => expect(resourceIdentityKey(identity)).toBe("rumptycloud:kora-test:lagos-1:virtual_machine:vm_123"));
  it("identity changes when immutable provider id changes", () => expect(resourceIdentityKey({ ...identity, providerResourceId: "vm_456" })).not.toBe(resourceIdentityKey(identity)));
  it("redacts credentials", () => expect(redactSecret("failed token secret-value", ["secret-value"])).toBe("failed token [REDACTED]"));
  it("requires credentials", () => expect(() => new RumptyCloudProvider({ apiKey: "", workspace: "x" })).toThrow(ProviderError));
  it("advertises only implemented capabilities", () => expect([...new RumptyCloudProvider({ apiKey: "x", workspace: "w" }).capabilities]).toEqual(["RESOURCE_DISCOVERY", "RESOURCE_STATUS"]));
  it("parses stable VM identity", () => expect(parseVmList("ID  NAME  STATUS\nvm_123  demo  running", "ws", "lagos-1")[0]?.identity.providerResourceId).toBe("vm_123"));
  it("normalizes stopped state", () => expect(parseVmList("ID  NAME  STATUS\nvm_123  demo  stopped", "ws", "lagos-1")[0]?.status).toBe("stopped"));
  it("preserves unknown state without guessing", () => expect(parseVmList("ID  NAME  STATUS\nvm_123  demo  mystery", "ws", "lagos-1")[0]?.status).toBe("unknown"));
  it("rejects malformed provider output", () => expect(() => parseVmList("NAME  FOO\ndemo  bar", "ws", "lagos-1")).toThrow(ProviderError));
  it("normalizes auth failure without leaking token", async () => {
    const provider = new RumptyCloudProvider({ apiKey: "super-secret", workspace: "ws" }, async () => { throw new Error("401 unauthorized super-secret"); });
    await expect(provider.discoverResources()).rejects.toMatchObject({ code: "AUTHENTICATION", message: "RumptyCloud authentication failed" });
  });
  it("normalizes timeout", async () => { const provider = new RumptyCloudProvider({ apiKey: "x", workspace: "ws" }, async () => { throw new Error("ETIMEDOUT"); }); await expect(provider.discoverResources()).rejects.toMatchObject({ code: "TIMEOUT", retryable: true }); });
  it("normalizes rate limits", async () => { const provider = new RumptyCloudProvider({ apiKey: "x", workspace: "ws" }, async () => { throw new Error("429 rate limit"); }); await expect(provider.discoverResources()).rejects.toMatchObject({ code: "RATE_LIMITED", retryable: true }); });
  it("normalizes network failure", async () => { const provider = new RumptyCloudProvider({ apiKey: "x", workspace: "ws" }, async () => { throw new Error("ECONNREFUSED"); }); await expect(provider.discoverResources()).rejects.toMatchObject({ code: "NETWORK", retryable: true }); });
  it("does not resolve a resource outside provider scope", async () => { const provider = new RumptyCloudProvider({ apiKey: "x", workspace: "ws" }, async () => ({ stdout: "ID  NAME  STATUS\nvm_123  demo  running", stderr: "" })); await expect(provider.getResource({ ...identity, account: "other" })).rejects.toMatchObject({ code: "NOT_FOUND" }); });
});
