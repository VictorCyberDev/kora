// Serves rendered golden sites (and the real font/media routes) on a fixed port for tools that need a URL.
// usage: node serve-gold.mjs <goldDir> <port>
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
const root = process.argv[2] ?? "/var/tmp/gold";
const port = Number(process.argv[3] ?? 4399);
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
};
createServer((r, res) => {
  const u = decodeURIComponent((r.url ?? "/").split("?")[0]);
  const m = /^\/s\/([^/]+)\/(\d)(\/.*)?$/.exec(u);
  let file;
  if (u.startsWith("/_kora/fonts/"))
    file = join("packages/site-fonts/files", u.slice(13));
  else if (u.startsWith("/_kora/media/"))
    file = join("packages/site-media/files", u.slice(13));
  else if (m) {
    file = join(root, m[1], m[2], m[3] ?? "/");
    if (file.endsWith("/")) file += "index.html";
    else if (!extname(file)) file += "/index.html";
  }
  if (!file || !existsSync(file)) {
    res.writeHead(404);
    return res.end("nf");
  }
  res.writeHead(200, {
    "content-type": types[extname(file)] ?? "application/octet-stream",
  });
  res.end(readFileSync(file));
}).listen(port, () => console.log("serving", root, "on", port));
