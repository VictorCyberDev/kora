import Fastify from "fastify";
import { z, ZodError } from "zod";
import { KoraStore } from "./store.js";

const idParams = z.object({ id: z.string().uuid() });
export function buildApi(
  store: KoraStore,
  nodeEnv = "development",
  logLevel = "info",
) {
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
  return app;
}
