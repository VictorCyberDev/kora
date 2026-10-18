import postgres from "postgres";
import { EVENT_SCHEMA_VERSION } from "@kora/event-schema";
import { loadConfig } from "./config.js";
import { buildApi } from "./app.js";
import { KoraStore } from "./store.js";
import { HealthMonitor } from "./monitor.js";
import { verifierFromConfig } from "./verification/verifier.js";
import { RumptyCloudProvider } from "./providers/rumptycloud.js";

const config = loadConfig();
const sql = postgres(config.DATABASE_URL);
const store = new KoraStore(sql);
const service = await store.ensureService(
  config.MONITOR_SERVICE_NAME,
  config.MONITOR_HEALTH_URL,
);

let resourceId: string | null = null;
let providerStatus: string | null = null;
if (
  config.RUMPTY_WORKSPACE &&
  config.RUMPTY_REGION &&
  config.RUMPTY_RESOURCE_TYPE &&
  config.RUMPTY_RESOURCE_ID
) {
  const provider = new RumptyCloudProvider();
  const resource = provider.normalizeResource({
    workspace: config.RUMPTY_WORKSPACE,
    region: config.RUMPTY_REGION,
    resourceType: config.RUMPTY_RESOURCE_TYPE,
    resourceId: config.RUMPTY_RESOURCE_ID,
    displayName: config.RUMPTY_RESOURCE_NAME,
    environment: config.KORA_ENVIRONMENT,
    publicUrl: new URL(config.MONITOR_HEALTH_URL).origin,
    healthPath: new URL(config.MONITOR_HEALTH_URL).pathname,
  });
  const storedResource = await store.ensureProviderResource(resource);
  resourceId = String(storedResource.id);
  providerStatus = resource.status ?? null;
  await store.bindServiceToResource(String(service.id), resourceId);
}

await store.recordEvent({
  eventId: crypto.randomUUID(),
  eventType: "ServiceRegistered",
  schemaVersion: EVENT_SCHEMA_VERSION,
  occurredAt: new Date().toISOString(),
  source: "kora-api",
  serviceId: String(service.id),
  payload: {
    name: config.MONITOR_SERVICE_NAME,
    healthUrl: config.MONITOR_HEALTH_URL,
    resourceId,
  },
});
const app = buildApi(store, config.NODE_ENV, config.LOG_LEVEL);
const monitor = new HealthMonitor(
  config,
  store,
  app.log,
  String(service.id),
  resourceId,
  providerStatus,
);
const verifier = verifierFromConfig(config, store, String(service.id), app.log);
app.addHook("onClose", async () => {
  await monitor.stop();
  await verifier?.stop();
  await sql.end();
});
await app.listen({ host: config.API_HOST, port: config.API_PORT });
if (config.MONITOR_ENABLED) {
  monitor.start();
  verifier?.start();
}
