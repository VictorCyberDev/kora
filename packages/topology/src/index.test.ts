import { describe, expect, it } from "vitest";
import {
  affectedComponents,
  providerResourceKey,
  validateGraph,
  type SiteGraph,
  type SystemTopology,
} from "./index.js";

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

describe("system graph", () => {
  const graph: SiteGraph = {
    nodes: [
      { id: "ws", kind: "provider_workspace", label: "ws" },
      { id: "vm", kind: "provider_compute", label: "vm" },
      { id: "dep", kind: "deployment", label: "dep" },
      { id: "health", kind: "health_endpoint", label: "health" },
      { id: "site", kind: "site", label: "site" },
      { id: "dom", kind: "domain", label: "example.com" },
      { id: "form", kind: "forms_backend", label: "forms" },
    ],
    edges: [
      { from: "ws", to: "vm", relationship: "HOSTS" },
      { from: "vm", to: "dep", relationship: "RUNS" },
      { from: "dep", to: "health", relationship: "EXPOSES" },
      { from: "dom", to: "site", relationship: "ROUTES_TO" },
      { from: "site", to: "form", relationship: "DEPENDS_ON" },
      { from: "dep", to: "site", relationship: "DEPLOYED_AS" },
    ],
  };
  it("propagates a compute failure to everything it runs and serves", () => {
    expect(affectedComponents(graph, "vm").map((n) => n.id)).toEqual([
      "dep",
      "dom",
      "health",
      "site",
    ]);
  });
  it("propagates a dependency failure to its dependents only", () => {
    expect(affectedComponents(graph, "form").map((n) => n.id)).toEqual([
      "dom",
      "site",
    ]);
    expect(affectedComponents(graph, "health")).toEqual([]);
  });
  it("flags edges to unknown nodes", () => {
    expect(
      validateGraph({
        nodes: [],
        edges: [{ from: "a", to: "b", relationship: "HOSTS" }],
      }),
    ).toHaveLength(1);
    expect(validateGraph(graph)).toEqual([]);
  });
});
