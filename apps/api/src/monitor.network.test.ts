import fs from "node:fs";
import https from "node:https";
import net from "node:net";
import { fileURLToPath } from "node:url";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { observeOnce } from "./test-support/monitor-harness.js";

const fixture = (name: string) =>
  fs.readFileSync(
    fileURLToPath(new URL(`../test-fixtures/${name}`, import.meta.url)),
  );
const listen = (server: net.Server) =>
  new Promise<number>((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve((server.address() as net.AddressInfo).port),
    ),
  );
const close = (server: net.Server) =>
  new Promise<void>((resolve) => server.close(() => resolve()));

describe("health check classification against real local failures", () => {
  const servers: net.Server[] = [];
  let closedPort = 0;
  let holePort = 0;
  let selfSignedPort = 0;
  let expiredPort = 0;
  let plainPort = 0;
  const open: net.Socket[] = [];

  beforeAll(async () => {
    const tmp = net.createServer();
    closedPort = await listen(tmp);
    await close(tmp);
    const hole = net.createServer((s) => {
      s.on("error", () => undefined);
    });
    holePort = await listen(hole);
    const secure = (name: string) =>
      https.createServer(
        { key: fixture(`${name}.key`), cert: fixture(`${name}.crt`) },
        (_req, res) => res.end("ok"),
      );
    const selfSigned = secure("self-signed");
    selfSignedPort = await listen(selfSigned);
    const expired = secure("expired");
    expiredPort = await listen(expired);
    const plain = net.createServer((s) => {
      s.on("error", () => undefined);
      s.end("HTTP/1.1 200 OK\r\ncontent-length: 0\r\n\r\n");
    });
    plainPort = await listen(plain);
    servers.push(hole, selfSigned, expired, plain);
    for (const server of servers)
      server.on("connection", (socket) => open.push(socket));
  });
  afterAll(async () => {
    for (const s of open) s.destroy();
    for (const s of servers) {
      await close(s);
    }
  });

  const expectMeaningful = (reason: string | null) => {
    expect(reason).toBeTruthy();
    expect(reason).not.toBe("fetch failed");
  };

  it("classifies an unresolvable .invalid host as DNS_FAILURE", async () => {
    const o = await observeOnce("http://kora-r0.invalid/health");
    expect(o.healthy).toBe(false);
    expect(o.failureCategory).toBe("DNS_FAILURE");
    expect(o.timedOut).toBe(false);
    expectMeaningful(o.failureReason);
    expect(o.failureReason).toMatch(/ENOTFOUND|EAI_AGAIN/);
  });
  it("classifies a closed 127.0.0.1 port as CONNECTION_REFUSED", async () => {
    const o = await observeOnce(`http://127.0.0.1:${closedPort}/health`);
    expect(o.failureCategory).toBe("CONNECTION_REFUSED");
    expectMeaningful(o.failureReason);
    expect(o.failureReason).toContain("ECONNREFUSED");
  });
  it("classifies a closed localhost port as CONNECTION_REFUSED", async () => {
    const o = await observeOnce(`http://localhost:${closedPort}/health`);
    expect(o.failureCategory).toBe("CONNECTION_REFUSED");
    expectMeaningful(o.failureReason);
  });
  it("classifies a server that accepts but never answers as TIMEOUT", async () => {
    const o = await observeOnce(`http://127.0.0.1:${holePort}/health`, 300);
    expect(o.failureCategory).toBe("TIMEOUT");
    expect(o.timedOut).toBe(true);
    expectMeaningful(o.failureReason);
  });
  it("classifies a self-signed certificate as TLS_FAILURE", async () => {
    const o = await observeOnce(`https://127.0.0.1:${selfSignedPort}/health`);
    expect(o.failureCategory).toBe("TLS_FAILURE");
    expectMeaningful(o.failureReason);
    expect(o.failureReason).toContain("DEPTH_ZERO_SELF_SIGNED_CERT");
  });
  it("classifies an expired certificate as TLS_FAILURE", async () => {
    const o = await observeOnce(`https://127.0.0.1:${expiredPort}/health`);
    expect(o.failureCategory).toBe("TLS_FAILURE");
    expectMeaningful(o.failureReason);
    expect(o.failureReason).toContain("CERT_HAS_EXPIRED");
  });
  it("classifies HTTPS to a plaintext server as TLS_FAILURE", async () => {
    const o = await observeOnce(`https://127.0.0.1:${plainPort}/health`);
    expect(o.failureCategory).toBe("TLS_FAILURE");
    expectMeaningful(o.failureReason);
    expect(o.failureReason).toMatch(/ERR_SSL_|ERR_TLS_/);
  });
});

describe("health check classification of synthetic error shapes", () => {
  afterEach(() => vi.unstubAllGlobals());
  const failWith = async (error: unknown) => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    vi.stubGlobal("fetch", () => Promise.reject(error));
    return observeOnce("http://svc.test/health");
  };
  const coded = (code: string, message = code, cause?: unknown) =>
    Object.assign(new Error(message, cause ? { cause } : undefined), { code });
  const fetchFailed = (cause: unknown) =>
    new TypeError("fetch failed", { cause });

  it("finds ECONNREFUSED inside AggregateError.errors", async () => {
    const o = await failWith(
      fetchFailed(
        Object.assign(
          new AggregateError([
            coded("ECONNREFUSED", "connect ECONNREFUSED ::1:3100"),
            coded("ECONNREFUSED", "connect ECONNREFUSED 127.0.0.1:3100"),
          ]),
          { code: "ECONNREFUSED" },
        ),
      ),
    );
    expect(o.failureCategory).toBe("CONNECTION_REFUSED");
    expect(o.failureReason).toContain("ECONNREFUSED");
  });
  it("finds a nested code in an AggregateError without its own code", async () => {
    const o = await failWith(
      fetchFailed(
        new AggregateError([
          coded("ECONNREFUSED", "connect ECONNREFUSED ::1:1"),
        ]),
      ),
    );
    expect(o.failureCategory).toBe("CONNECTION_REFUSED");
  });
  it("walks multi-level cause chains", async () => {
    const o = await failWith(
      new Error("outer", {
        cause: new Error("middle", {
          cause: new Error("inner", { cause: coded("EAI_AGAIN", "temporary") }),
        }),
      }),
    );
    expect(o.failureCategory).toBe("DNS_FAILURE");
  });
  it.each([
    ["ENOTFOUND", "DNS_FAILURE"],
    ["EAI_AGAIN", "DNS_FAILURE"],
    ["ECONNREFUSED", "CONNECTION_REFUSED"],
    ["CERT_HAS_EXPIRED", "TLS_FAILURE"],
    ["DEPTH_ZERO_SELF_SIGNED_CERT", "TLS_FAILURE"],
    ["UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "TLS_FAILURE"],
    ["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "TLS_FAILURE"],
    ["ERR_TLS_CERT_ALTNAME_INVALID", "TLS_FAILURE"],
    ["ERR_SSL_WRONG_VERSION_NUMBER", "TLS_FAILURE"],
    ["UND_ERR_CONNECT_TIMEOUT", "TIMEOUT"],
    ["UND_ERR_HEADERS_TIMEOUT", "TIMEOUT"],
    ["UND_ERR_BODY_TIMEOUT", "TIMEOUT"],
    ["ECONNRESET", "UNKNOWN"],
    ["UND_ERR_SOCKET", "UNKNOWN"],
  ])("maps code %s to %s", async (code, category) => {
    const o = await failWith(fetchFailed(coded(code)));
    expect(o.failureCategory).toBe(category);
    expect(o.timedOut).toBe(category === "TIMEOUT");
    expect(o.failureReason).not.toBe("fetch failed");
    expect(o.failureReason).toContain(code);
  });
  it("maps TimeoutError to TIMEOUT", async () => {
    const o = await failWith(new DOMException("timed out", "TimeoutError"));
    expect(o.failureCategory).toBe("TIMEOUT");
    expect(o.timedOut).toBe(true);
  });
  it("maps a bare AbortError to UNKNOWN, not TIMEOUT", async () => {
    const o = await failWith(new DOMException("aborted", "AbortError"));
    expect(o.failureCategory).toBe("UNKNOWN");
    expect(o.failureReason).toBe("health check aborted");
    expect(o.timedOut).toBe(false);
  });
  it("does not match message substrings when no code is present", async () => {
    const o = await failWith(
      new Error("certificate problem: ECONNREFUSED dns tls"),
    );
    expect(o.failureCategory).toBe("UNKNOWN");
  });
  it("surfaces the cause message for an unrecognised failure", async () => {
    const o = await failWith(fetchFailed(coded("EPIPE", "write EPIPE")));
    expect(o.failureCategory).toBe("UNKNOWN");
    expect(o.failureReason).toContain("write EPIPE");
  });
  it("keeps a plain message for a non-Error rejection", async () => {
    const o = await failWith("boom");
    expect(o.failureCategory).toBe("UNKNOWN");
    expect(o.failureReason).toBe("unknown health check error");
  });
  it("strips URL userinfo and secrets from reasons", async () => {
    const o = await failWith(
      fetchFailed(
        coded(
          "ECONNREFUSED",
          "connect ECONNREFUSED https://admin:hunter2@10.0.0.1:443/x?token=abc123 password=hunter2",
        ),
      ),
    );
    expect(o.failureCategory).toBe("CONNECTION_REFUSED");
    expect(o.failureReason).not.toContain("hunter2");
    expect(o.failureReason).not.toContain("admin");
    expect(o.failureReason).not.toContain("abc123");
    expect(o.failureReason).toContain("10.0.0.1");
  });
  it("terminates on cyclic cause chains", async () => {
    const a = new Error("a") as Error & { cause?: unknown };
    const b = new Error("b", { cause: a });
    a.cause = b;
    const o = await failWith(a);
    expect(o.failureCategory).toBe("UNKNOWN");
  });
});
