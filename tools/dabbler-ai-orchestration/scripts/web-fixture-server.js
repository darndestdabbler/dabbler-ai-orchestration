#!/usr/bin/env node
// Static file server for the Set 113 S3 fixture web app.
//
// Serves `src/test/fixtures/task-board/` over HTTP on an EPHEMERAL port.
// Two reasons it is HTTP rather than a `file://` URL, which would have been
// smaller:
//
//   1. The claim under test is about the web targets the operator named
//      (.NET, Java, vanilla JS, Python) -- all of which a reviewer reaches
//      at an `http://` origin. Proving the recorder against `file://` would
//      prove a neighbouring thing.
//   2. It keeps the driver's configuration a plain URL, so a consumer repo
//      points the same recorder at `http://localhost:5173` (or whatever
//      their dev server is) and changes nothing else. That is the
//      cross-cutting value; a path would not have it.
//
// Port 0 means the OS picks a free port, so two runs never collide and
// nothing has to be reserved. Dependency-free: `node:http` only.

"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");

const FIXTURE_ROOT = path.resolve(
  __dirname,
  "..",
  "src",
  "test",
  "fixtures",
  "task-board"
);

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

/**
 * Start the fixture server. Resolves to `{ url, close }` where `url` is the
 * origin the fixture's index page is served from and `close()` is idempotent
 * so a failure path may call it without checking whether the happy path
 * already did.
 */
function startFixtureServer(root) {
  const serveRoot = root || FIXTURE_ROOT;
  if (!fs.existsSync(path.join(serveRoot, "index.html"))) {
    return Promise.reject(
      new Error(
        `fixture web app not found at ${serveRoot} - run from a full checkout ` +
          "(the fixture is committed, not generated)."
      )
    );
  }

  const server = http.createServer((req, res) => {
    // Strip the query and anything trying to climb out of the fixture root.
    const requested = decodeURIComponent((req.url || "/").split("?")[0]);
    const relative = requested === "/" ? "index.html" : requested.replace(/^\/+/, "");
    const target = path.resolve(serveRoot, relative);
    if (!target.startsWith(serveRoot + path.sep) && target !== serveRoot) {
      res.writeHead(403).end("forbidden");
      return;
    }
    fs.readFile(target, (err, body) => {
      if (err) {
        res.writeHead(404).end("not found");
        return;
      }
      res.writeHead(200, {
        "content-type":
          CONTENT_TYPES[path.extname(target).toLowerCase()] ||
          "application/octet-stream",
        // The fixture is driven repeatedly in one session; a cached copy
        // of an edited fixture is a debugging trap nobody needs.
        "cache-control": "no-store",
      });
      res.end(body);
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      let closed = false;
      resolve({
        url: `http://127.0.0.1:${port}/`,
        close() {
          if (closed) return Promise.resolve();
          closed = true;
          return new Promise((done) => server.close(() => done()));
        },
      });
    });
  });
}

module.exports = { startFixtureServer, FIXTURE_ROOT };

if (require.main === module) {
  startFixtureServer().then(({ url }) => {
    console.log(`[web-fixture] serving ${FIXTURE_ROOT}`);
    console.log(`[web-fixture] ${url}`);
    console.log("[web-fixture] Ctrl+C to stop.");
  });
}
