import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  UnsafeUrl,
  isPrivateAddress,
  safeFetchHtml,
  validateTarget,
} from "./safe-fetch.js";

describe("safe fetch", () => {
  it("classifies private and public addresses", () => {
    for (const a of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:10.0.0.1",
      "224.0.0.1",
    ])
      expect(isPrivateAddress(a), a).toBe(true);
    for (const a of [
      "8.8.8.8",
      "1.1.1.1",
      "2606:4700:4700::1111",
      "172.32.0.1",
    ])
      expect(isPrivateAddress(a), a).toBe(false);
  });
  it("rejects dangerous targets before any connection", () => {
    for (const u of [
      "file:///etc/passwd",
      "ftp://x.example",
      "http://localhost/",
      "http://127.0.0.1/",
      "http://[::1]/",
      "http://169.254.169.254/latest",
      "http://user:pw@example.com/",
      "http://example.com:8080/",
      "http://printer.local/",
      "nonsense",
    ])
      expect(() => validateTarget(u, false), u).toThrow(UnsafeUrl);
    expect(validateTarget("https://example.com/", false).hostname).toBe(
      "example.com",
    );
  });
  it("refuses a name that resolves to a private address", async () => {
    await expect(
      safeFetchHtml("http://localhost.localdomain/"),
    ).rejects.toThrow();
  });

  let server: http.Server;
  let base = "";
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/page")
        return void res
          .writeHead(200, { "content-type": "text/html" })
          .end("<html><title>Hi there friend</title></html>");
      if (req.url === "/redir")
        return void res.writeHead(302, { location: "/page" }).end();
      if (req.url === "/loop")
        return void res.writeHead(302, { location: "/loop" }).end();
      if (req.url === "/big")
        return void res
          .writeHead(200, { "content-type": "text/html" })
          .end("x".repeat(3_000_000));
      if (req.url === "/json")
        return void res
          .writeHead(200, { "content-type": "application/json" })
          .end("{}");
      res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("reads a page, follows a redirect, caps size, stops loops and non-HTML", async () => {
    const o = { allowPrivate: true };
    expect((await safeFetchHtml(`${base}/page`, o)).html).toContain(
      "Hi there friend",
    );
    expect((await safeFetchHtml(`${base}/redir`, o)).finalUrl).toBe(
      `${base}/page`,
    );
    const big = await safeFetchHtml(`${base}/big`, { ...o, maxBytes: 100_000 });
    expect(big.truncated).toBe(true);
    await expect(safeFetchHtml(`${base}/loop`, o)).rejects.toThrow(/too many/);
    await expect(safeFetchHtml(`${base}/json`, o)).rejects.toThrow(/web page/);
    await expect(safeFetchHtml(`${base}/page`)).rejects.toThrow(UnsafeUrl);
  });
});
