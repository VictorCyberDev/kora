export type ComponentKind =
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
  "HOSTS" | "RUNS" | "EXPOSES" | "DEPENDS_ON" | "MONITORS";

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
