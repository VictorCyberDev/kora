import { describe, expect, it } from "vitest";
import { classifyHealthError, classifyHttpStatus } from "./monitor.js";
describe("failure classification", () => {
  it("classifies HTTP 4xx", () => expect(classifyHttpStatus(404)).toBe("http_4xx"));
  it("classifies HTTP 5xx", () => expect(classifyHttpStatus(503)).toBe("http_5xx"));
  it("does not call non-error HTTP a diagnosis", () => expect(classifyHttpStatus(302)).toBe("http"));
  it("classifies DNS failures", () => expect(classifyHealthError(new Error("getaddrinfo ENOTFOUND host")).category).toBe("dns"));
  it("classifies connection refused", () => expect(classifyHealthError(new Error("connect ECONNREFUSED")).category).toBe("connection_refused"));
  it("classifies TLS failures", () => expect(classifyHealthError(new Error("CERT_HAS_EXPIRED")).category).toBe("tls"));
  it("leaves other network failures as network", () => expect(classifyHealthError(new Error("socket closed")).category).toBe("network"));
});
