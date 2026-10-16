import Fastify from "fastify";
import { createRuntimeClaim } from "@kora/runtime-claim";
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
  options: { runtimeClaim?: ReturnType<typeof createRuntimeClaim> } = {},
) {
  const config = demoConfigSchema.parse(input);
  const app = Fastify({ logger: config.NODE_ENV !== "test" });
  const runtimeClaim =
    options.runtimeClaim ??
    createRuntimeClaim({ service: "demo-service", env: input });
  let failing = false;
  app.get("/health", (_request, reply) =>
    failing
      ? reply.code(503).send({ status: "unhealthy" })
      : { status: "healthy" },
  );
  // Self-reported identity of this process: unauthenticated, read-only, no
  // secrets, and a claim rather than proof (ADR-009).
  app.get("/__kora", (_request, reply) =>
    reply.header("cache-control", "no-store").send(runtimeClaim.snapshot()),
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
