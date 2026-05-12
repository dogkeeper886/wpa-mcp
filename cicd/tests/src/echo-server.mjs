#!/usr/bin/env node
// Tiny in-container HTTP echo helper for AC2 (Accept-Language) integration test.
// Listens on 127.0.0.1:8765 and logs every request's headers to stdout.
// Used by TC-INT-019 to verify the browser sends the configured Accept-Language.

import { createServer } from "http";

createServer((req, res) => {
  console.log("REQ", req.method, req.url, JSON.stringify(req.headers));
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ headers: req.headers }));
}).listen(8765, "127.0.0.1", () => {
  console.log("echo listening on 127.0.0.1:8765");
});
