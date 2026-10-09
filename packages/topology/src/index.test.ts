import { describe, expect, it } from "vitest";
import { providerResourceKey, type SystemTopology } from "./index.js";

const identity = {
  provider: "rumptycloud",
  providerAccount: "kora",
  region: "lagos",
  resourceType: "virtual_machine",
  providerResourceId: "vm-123",
};

describe("cloud topology", () => {
  it("builds a deterministic resource key from durable identity", () => {
    expect(providerResourceKey(identity)).toBe(
      "rumptycloud:kora:lagos:virtual_machine:vm-123",
    );
  });

  it("changes identity when the provider resource ID changes", () => {
    expect(providerResourceKey(identity)).not.toBe(
      providerResourceKey({ ...identity, providerResourceId: "vm-456" }),
    );
  });

  it("does not use display names as resource identity", () => {
    const withName = { ...identity, displayName: "renamed" };
    expect(providerResourceKey(withName)).toBe(providerResourceKey(identity));
  });

  it("represents provider to service reliability relationships explicitly", () => {
    const topology: SystemTopology = {
      components: [
        { id: "provider", name: "RumptyCloud", kind: "provider" },
        {
          id: "vm",
          name: "VM",
          kind: "compute",
          providerResourceKey: providerResourceKey(identity),
        },
        { id: "service", name: "demo", kind: "service" },
        { id: "health", name: "/health", kind: "health_endpoint" },
      ],
      dependencies: [
        {
          fromComponentId: "provider",
          toComponentId: "vm",
          relationship: "HOSTS",
        },
        {
          fromComponentId: "vm",
          toComponentId: "service",
          relationship: "RUNS",
        },
        {
          fromComponentId: "service",
          toComponentId: "health",
          relationship: "EXPOSES",
        },
      ],
    };
    expect(topology.dependencies.map((x) => x.relationship)).toEqual([
      "HOSTS",
      "RUNS",
      "EXPOSES",
    ]);
  });
});
