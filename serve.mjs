// Serve out/ so the report can be opened in a browser. Static, no deps.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { OUT_DIR } from "./lib/sources.mjs";
const PORT = Number(process.env.PORT || 4950);
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".md": "text/markdown; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };
http
  .createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/index.html";
    const f = path.join(OUT_DIR, path.normalize(p).replace(/^(\.\.[/\\])+/, ""));
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404); return res.end("Not found"); }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(data);
    });
  })
  .listen(PORT, () => console.log(`report at http://localhost:${PORT}`));
