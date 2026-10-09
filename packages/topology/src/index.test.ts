import { describe, expect, it } from "vitest";
import { relatedComponents, type SystemTopology } from "./index.js";
const topology: SystemTopology = { components: [{ id: "provider", name: "RumptyCloud", kind: "provider" }, { id: "vm", name: "vm_123", kind: "compute" }, { id: "service", name: "demo", kind: "service" }, { id: "health", name: "/health", kind: "health_endpoint" }], dependencies: [{ fromComponentId: "provider", toComponentId: "vm", relationship: "hosts" }, { fromComponentId: "vm", toComponentId: "service", relationship: "runs" }, { fromComponentId: "service", toComponentId: "health", relationship: "exposes" }] };
describe("topology", () => {
  it("represents provider to compute", () => expect(topology.dependencies).toContainEqual({ fromComponentId: "provider", toComponentId: "vm", relationship: "hosts" }));
  it("represents compute to service", () => expect(topology.dependencies).toContainEqual({ fromComponentId: "vm", toComponentId: "service", relationship: "runs" }));
  it("finds direct neighbors", () => expect(relatedComponents(topology, "vm").map((x) => x.id)).toEqual(["provider", "service"]));
});
