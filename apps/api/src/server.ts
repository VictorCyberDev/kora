import postgres from "postgres";
import { EVENT_SCHEMA_VERSION } from "@kora/event-schema";
import { loadConfig } from "./config.js";
import { buildApi } from "./app.js";
import { KoraStore } from "./store.js";
import { HealthMonitor } from "./monitor.js";

const config = loadConfig();
const sql = postgres(config.DATABASE_URL);
const store = new KoraStore(sql);
const service = await store.ensureService(
  config.MONITOR_SERVICE_NAME,
  config.MONITOR_HEALTH_URL,
);
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
  },
});
const app = buildApi(store, config.NODE_ENV, config.LOG_LEVEL);
const monitor = new HealthMonitor(config, store, app.log, String(service.id));
app.addHook("onClose", async () => {
  await monitor.stop();
  await sql.end();
});
await app.listen({ host: config.API_HOST, port: config.API_PORT });
if (config.MONITOR_ENABLED) monitor.start();
