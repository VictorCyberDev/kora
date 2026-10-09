export type ComponentKind = 'service' | 'database' | 'cache' | 'worker' | 'storage';
export interface TopologyComponent { id: string; name: string; kind: ComponentKind; }
export interface Dependency { fromComponentId: string; toComponentId: string; relationship: 'depends_on'; }
export interface SystemTopology { components: readonly TopologyComponent[]; dependencies: readonly Dependency[]; }
