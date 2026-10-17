import Fastify from "fastify";
import { z, ZodError } from "zod";
import { createRuntimeClaim } from "@kora/runtime-claim";
import { KoraStore } from "./store.js";

const idParams = z.object({ id: z.string().uuid() });
const snapshotParams = z.object({
  id: z.string().uuid(),
  snapshotId: z.string().uuid(),
});
export function buildApi(
  store: KoraStore,
  nodeEnv = "development",
  logLevel = "info",
  options: { runtimeClaim?: ReturnType<typeof createRuntimeClaim> } = {},
) {
  const runtimeClaim =
    options.runtimeClaim ?? createRuntimeClaim({ service: "kora-api" });
  const app = Fastify({
    logger: nodeEnv === "test" ? false : { level: logLevel },
    genReqId: (req) =>
      String(req.headers["x-request-id"] ?? crypto.randomUUID()),
    disableRequestLogging: false,
  });
  app.setErrorHandler((error, request, reply) => {
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
  return app;
}
