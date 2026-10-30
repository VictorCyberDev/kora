export type ComponentKind =
  | "organization"
  | "site"
  | "domain"
  | "deployment"
  | "provider_workspace"
  | "provider_compute"
  | "site_version"
  | "forms_backend"
  | "provider"
  | "environment"
  | "compute"
  | "service"
  | "health_endpoint"
  | "database"
  | "cache"
  | "worker"
  | "storage";

export type ProviderCapability =
  | "RESOURCE_DISCOVERY"
  | "RESOURCE_STATUS"
  | "HEALTH_OBSERVATION"
  | "LOG_ACCESS"
  | "METRIC_ACCESS"
  | "DEPLOYMENT_METADATA"
  | "RESTART"
  | "REDEPLOY"
  | "ROLLBACK"
  | "SCALING";

export type TopologyRelationship =
  | "HOSTS"
  | "RUNS"
  | "EXPOSES"
  | "DEPENDS_ON"
  | "MONITORS"
  | "ROUTES_TO"
  | "STORES_IN"
  | "DEPLOYED_AS";

export interface ProviderResourceIdentity {
  provider: string;
  providerAccount: string;
  region: string;
  resourceType: string;
  providerResourceId: string;
}

export const providerResourceKey = (identity: ProviderResourceIdentity) =>
  [
    identity.provider,
    identity.providerAccount,
    identity.region,
    identity.resourceType,
    identity.providerResourceId,
  ].join(":");

export interface ProviderResource extends ProviderResourceIdentity {
  displayName?: string;
  environment: string;
  status?: string;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export interface CloudProvider {
  readonly name: string;
  readonly capabilities: ReadonlySet<ProviderCapability>;
  normalizeResource(input: unknown): ProviderResource;
}

export interface TopologyComponent {
  id: string;
  name: string;
  kind: ComponentKind;
  providerResourceKey?: string;
}

export interface Dependency {
  fromComponentId: string;
  toComponentId: string;
  relationship: TopologyRelationship | "depends_on";
}

export interface SystemTopology {
  components: readonly TopologyComponent[];
  dependencies: readonly Dependency[];
}

// ---- system graph ----------------------------------------------------------
export interface GraphNode {
  id: string;
  kind: ComponentKind;
  label: string;
}
export interface GraphEdge {
  from: string;
  to: string;
  relationship: TopologyRelationship;
}
export interface SiteGraph {
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
}

/**
 * Which way a failure travels along each relationship.
 * "forward": if `from` fails, `to` is affected (provider side to consumer).
 * "backward": if `to` fails, `from` is affected (a dependent on its dependency).
 * MONITORS carries no failure.
 */
const PROPAGATION: Record<
  TopologyRelationship,
  "forward" | "backward" | "none"
> = {
  HOSTS: "forward",
  RUNS: "forward",
  EXPOSES: "forward",
  DEPLOYED_AS: "forward",
  DEPENDS_ON: "backward",
  STORES_IN: "backward",
  ROUTES_TO: "backward",
  MONITORS: "none",
};

/** Every node a failure of `failedId` reaches, excluding itself, in stable order. */
export function affectedComponents(
  graph: SiteGraph,
  failedId: string,
): GraphNode[] {
  const seen = new Set<string>([failedId]);
  const queue = [failedId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of graph.edges) {
      const mode = PROPAGATION[edge.relationship];
      const next =
        mode === "forward" && edge.from === current
          ? edge.to
          : mode === "backward" && edge.to === current
            ? edge.from
            : null;
      if (next && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  seen.delete(failedId);
  return graph.nodes
    .filter((n) => seen.has(n.id))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Rejects edges that point at unknown nodes: no fabricated relationships. */
export function validateGraph(graph: SiteGraph): string[] {
  const ids = new Set(graph.nodes.map((n) => n.id));
  return graph.edges
    .filter((e) => !ids.has(e.from) || !ids.has(e.to))
    .map(
      (e) => `${e.from} ${e.relationship} ${e.to} references an unknown node`,
    );
}
