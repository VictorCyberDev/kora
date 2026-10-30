import { describe, expect, it } from "vitest";
import { etagFor, resolveArtifactPath, serveArtifact } from "../src/index.js";

const files = {
  "index.html": "<h1>Home</h1>",
  "styles.css": "a{}",
  "services/index.html": "<h1>S</h1>",
};

describe("artifact serving", () => {
  it("resolves root, directories and files; redirects bare directories", () => {
    expect(resolveArtifactPath(files, "")).toEqual({ path: "index.html" });
    expect(resolveArtifactPath(files, "services/")).toEqual({
      path: "services/index.html",
    });
    expect(resolveArtifactPath(files, "services")).toEqual({
      redirect: "services/",
    });
    expect(resolveArtifactPath(files, "styles.css")).toEqual({
      path: "styles.css",
    });
  });
  it("rejects traversal, NUL, backslashes and prototype keys", () => {
    for (const p of [
      "../etc/passwd",
      "a/../../b",
      "x\0y",
      "..\\x",
      "__proto__",
      "constructor",
    ])
      expect(resolveArtifactPath(files, p), p).toBeNull();
  });
  it("serves with security headers, an ETag and a cheap 304", () => {
    const r = serveArtifact(files, "", "/s/x/");
    expect(r).toMatchObject({ status: 200, body: "<h1>Home</h1>" });
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers.etag).toBe(etagFor("<h1>Home</h1>"));
    expect(serveArtifact(files, "", "/s/x/", r.headers.etag)).toMatchObject({
      status: 304,
      body: null,
    });
    expect(serveArtifact(files, "services", "/s/x/")).toMatchObject({
      status: 301,
    });
    expect(serveArtifact(files, "services", "/s/x/").headers.location).toBe(
      "/s/x/services/",
    );
    expect(serveArtifact(files, "nope", "/s/x/").status).toBe(404);
  });
});
