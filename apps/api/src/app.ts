import Fastify, { type FastifyBaseLogger } from "fastify";
import { z, ZodError } from "zod";
import { createRuntimeClaim } from "@kora/runtime-claim";
import { KoraStore } from "./store.js";
import { buildVerificationReport } from "./verification/report.js";
import { registerPassportRoutes } from "./passport-routes.js";
import { registerUiRoutes } from "./ui/ui-routes.js";
import { HttpError } from "./platform/http.js";
import { loadPlatformConfig } from "./platform/config.js";
import { registerPlatform, type PlatformRuntime } from "./platform/index.js";

const idParams = z.object({ id: z.string().uuid() });
const snapshotParams = z.object({
  id: z.string().uuid(),
  snapshotId: z.string().uuid(),
});
export function buildApi(
  store: KoraStore,
  nodeEnv = "development",
  logLevel = "info",
  options: {
    runtimeClaim?: ReturnType<typeof createRuntimeClaim>;
    platform?: PlatformRuntime;
    /** Builds the platform once the app's logger exists. */
    createPlatform?: (log: FastifyBaseLogger) => PlatformRuntime;
    webDir?: string;
  } = {},
) {
  const runtimeClaim =
    options.runtimeClaim ?? createRuntimeClaim({ service: "kora-api" });
  const trustProxy: boolean | ((address: string, hop: number) => boolean) = (
    options.platform?.config ?? loadPlatformConfig()
  ).KORA_TRUST_PROXY
    ? (_address, hop) => hop < 1
    : false;
  const app = Fastify({
    logger: nodeEnv === "test" ? false : { level: logLevel },
    // Trust exactly one proxy hop (the platform edge): trusting every
    // X-Forwarded-For entry would let a client spoof its IP past the rate limiters.
    trustProxy,
    genReqId: (req) =>
      String(req.headers["x-request-id"] ?? crypto.randomUUID()),
    disableRequestLogging: false,
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      reply.code(error.statusCode).send({
        error: error.code,
        message: error.message,
        requestId: request.id,
      });
      return;
    }
    request.log.error({ err: error }, "request failed");
    if (error instanceof ZodError) {
      reply.code(400).send({ error: "invalid_request", requestId: request.id });
      return;
    }
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    reply.code(status >= 500 ? 500 : status).send({
      error: status >= 500 ? "internal_server_error" : "bad_request",
      requestId: request.id,
    });
  });
  const platform = options.platform ?? options.createPlatform?.(app.log);
  if (platform)
    registerPlatform(app, platform, {
      ...(options.webDir ? { webDir: options.webDir } : {}),
    });
  app.get("/health", () => ({ status: "ok" }));
  // Self-reported identity of this process: unauthenticated, read-only, no
  // secrets, and a claim rather than proof (ADR-009).
  app.get("/__kora", (_request, reply) =>
    reply.header("cache-control", "no-store").send(runtimeClaim.snapshot()),
  );
  app.get("/services", async () => ({ data: await store.listServices() }));
  app.get("/services/:id", async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const item = await store.getService(id);
    return item
      ? { data: item }
      : reply.code(404).send({ error: "not_found", requestId: req.id });
  });
  app.get("/services/:id/verification", async (req, reply) => {
    const { id } = idParams.parse(req.params);
    if (!(await store.getService(id)))
      return reply.code(404).send({ error: "not_found", requestId: req.id });
    const latest = await store.getLatestVerification(id);
    if (!latest)
      return reply
        .code(404)
        .send({ error: "verification_not_run", requestId: req.id });
    return { data: buildVerificationReport(id, latest) };
  });
  app.get("/incidents", async () => ({ data: await store.listIncidents() }));
  app.get("/incidents/:id", async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const item = await store.getIncident(id);
    return item
      ? { data: item }
      : reply.code(404).send({ error: "not_found", requestId: req.id });
  });
  app.get("/incidents/:id/events", async (req, reply) => {
    const { id } = idParams.parse(req.params);
    if (!(await store.getIncident(id)))
      return reply.code(404).send({ error: "not_found", requestId: req.id });
    return { data: await store.getIncidentEvents(id) };
  });
  app.get("/incidents/:id/evidence", async (req, reply) => {
    const { id } = idParams.parse(req.params);
    if (!(await store.getIncident(id)))
      return reply.code(404).send({ error: "not_found", requestId: req.id });
    return { data: await store.getIncidentEvidence(id) };
  });
  app.get("/incidents/:id/timeline", async (req, reply) => {
    const { id } = idParams.parse(req.params);
    if (!(await store.getIncident(id)))
      return reply.code(404).send({ error: "not_found", requestId: req.id });
    return { data: await store.getIncidentTimeline(id) };
  });
  app.get("/incidents/:id/diagnosis", async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const snapshot = await store.computeDiagnosticSnapshot(id);
    return snapshot
      ? { data: snapshot }
      : reply.code(404).send({ error: "not_found", requestId: req.id });
  });
  app.post("/incidents/:id/diagnosis/snapshots", async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const computed = await store.computeDiagnosticSnapshot(id);
    if (!computed)
      return reply.code(404).send({ error: "not_found", requestId: req.id });
    const { created, snapshot } =
      await store.persistDiagnosticSnapshot(computed);
    return reply.code(created ? 201 : 200).send({ data: snapshot });
  });
  app.get("/incidents/:id/snapshots", async (req, reply) => {
    const { id } = idParams.parse(req.params);
    if (!(await store.getIncident(id)))
      return reply.code(404).send({ error: "not_found", requestId: req.id });
    return { data: await store.listDiagnosticSnapshots(id) };
  });
  app.get("/incidents/:id/snapshots/:snapshotId", async (req, reply) => {
    const { id, snapshotId } = snapshotParams.parse(req.params);
    const snapshot = await store.getDiagnosticSnapshot(id, snapshotId);
    return snapshot
      ? { data: snapshot }
      : reply.code(404).send({ error: "not_found", requestId: req.id });
  });
  registerPassportRoutes(app, store, {
    ...(platform
      ? {
          remediation: (id: string) => platform.operations.passportTrail(id),
        }
      : {}),
  });
  registerUiRoutes(app);
  return app;
}
