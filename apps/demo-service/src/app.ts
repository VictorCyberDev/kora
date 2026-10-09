import Fastify from "fastify";
import { z } from "zod";

export const demoConfigSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DEMO_FAILURE_INJECTION_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export function buildDemoService(
  input: Record<string, string | undefined> = process.env,
) {
  const config = demoConfigSchema.parse(input);
  const app = Fastify({ logger: config.NODE_ENV !== "test" });
  let failing = false;
  app.get("/health", (_request, reply) =>
    failing
      ? reply.code(503).send({ status: "unhealthy" })
      : { status: "healthy" },
  );
  const control = (
    next: boolean,
    reply: { code(n: number): { send(body: unknown): unknown } },
  ) => {
    if (!config.DEMO_FAILURE_INJECTION_ENABLED)
      return reply.code(404).send({ error: "not_found" });
    failing = next;
    return { failureInjected: failing };
  };
  app.post("/dev/failure", (_request, reply) => control(true, reply));
  app.post("/dev/recover", (_request, reply) => control(false, reply));
  return app;
}
