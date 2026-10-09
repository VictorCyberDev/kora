export type ComponentKind = "provider" | "environment" | "compute" | "service" | "health_endpoint" | "database" | "cache" | "worker" | "storage";
export type TopologyRelationship = "hosts" | "runs" | "exposes" | "depends_on" | "monitors";
export interface TopologyComponent {
  id: string;
  name: string;
  kind: ComponentKind;
  provider?: string;
  providerAccount?: string;
  region?: string;
  providerResourceId?: string;
}
export interface Dependency {
  fromComponentId: string;
  toComponentId: string;
  relationship: TopologyRelationship;
}
export interface SystemTopology { components: readonly TopologyComponent[]; dependencies: readonly Dependency[]; }
export function relatedComponents(topology: SystemTopology, id: string): readonly TopologyComponent[] {
  const ids = new Set(topology.dependencies.filter((edge) => edge.fromComponentId === id || edge.toComponentId === id).flatMap((edge) => [edge.fromComponentId, edge.toComponentId]).filter((candidate) => candidate !== id));
  return topology.components.filter((component) => ids.has(component.id));
}
