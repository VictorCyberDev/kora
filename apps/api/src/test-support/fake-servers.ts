import http from "node:http";
import type { AddressInfo } from "node:net";

export interface RecordedRequest {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
}
export interface FakeResponse {
  status?: number;
  body?: unknown; // JSON-encoded unless a string
  headers?: Record<string, string>;
  /** Never answer; the connection stays open until the server closes. */
  hang?: boolean;
  /** Destroy the socket without answering. */
  drop?: boolean;
}
type Handler = (request: RecordedRequest) => FakeResponse;

/** A local HTTP server for tests. Never touches the real network. */
export async function startFakeServer(handler: Handler) {
  const requests: RecordedRequest[] = [];
  const sockets = new Set<import("node:net").Socket>();
  const server = http.createServer((req, res) => {
    const recorded = {
      method: req.method ?? "GET",
      url: req.url ?? "/",
      headers: req.headers,
    };
    requests.push(recorded);
    const reply = handler(recorded);
    if (reply.drop) return req.socket.destroy();
    if (reply.hang) return;
    const body =
      typeof reply.body === "string"
        ? reply.body
        : JSON.stringify(reply.body ?? {});
    res.writeHead(reply.status ?? 200, {
      "content-type": "application/json",
      ...reply.headers,
    });
    res.end(body);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url,
    requests,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

export const sha = (n: number) => n.toString(16).padStart(40, "0");

/** A valid kora.runtime-claim/v1 body. */
export const claimBody = (over: Record<string, unknown> = {}) => ({
  schema: "kora.runtime-claim/v1",
  service: "demo-service",
  environment: "test",
  commit: sha(1),
  commitSource: "build-info",
  builtAt: "2026-03-04T09:00:00.000Z",
  startedAt: "2026-03-04T10:00:00.000Z",
  uptimeSeconds: 12,
  ...over,
});
