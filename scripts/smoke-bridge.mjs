#!/usr/bin/env node
/**
 * End-to-end smoke test for the VM bridge, runnable on any workspace
 * machine without a browser:
 *
 *   1. starts a fake token authority that behaves like the workspace
 *      server's /svc proxy for ONE known token (validates it, forwards the
 *      /__auth/<nonce> round trip to the bridge, rejects anything else);
 *   2. spawns the bridge exactly as the host does (`node -e <source> <port>`)
 *      with FORGE_SVC_AUTHORITY pointed at the fake;
 *   3. exercises the auth gate, /whoami, /local/repos, an allowlisted GitHub
 *      read, and a refused route, printing one line per check.
 *
 * Uses the machine's real `gh` credential for the GitHub read, so it also
 * confirms the credential works. Exit code is non-zero on any failure.
 *
 * Usage: node scripts/smoke-bridge.mjs [owner/repo]
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "bindings", "vm", "github-bridge.js"), "utf8");
const repo = process.argv[2] ?? null;

const GOOD_TOKEN = "sc_smoke_" + Math.random().toString(36).slice(2).padEnd(24, "x");
const BAD_TOKEN = "sc_smoke_bad_" + "y".repeat(20);

let failures = 0;
const check = (name, ok, detail = "") => {
  failures += ok ? 0 : 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const listen = (server) =>
  new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));

async function main() {
  let bridgePort = 0;

  // 1. Fake authority: /svc/forge/github-bridge/<rest>?token=T → bridge/<rest>
  const authority = http.createServer((req, res) => {
    const url = new URL(req.url, "http://authority.local");
    const prefix = "/svc/forge/github-bridge/";
    if (!url.pathname.startsWith(prefix) || url.searchParams.get("token") !== GOOD_TOKEN) {
      res.writeHead(401, { "content-type": "application/json" });
      return res.end('{"error":"unauthorized"}');
    }
    url.searchParams.delete("token");
    const forward = http.request(
      { host: "127.0.0.1", port: bridgePort, method: req.method, path: `/${url.pathname.slice(prefix.length)}${url.search}`, headers: { ...req.headers, "x-forwarded-prefix": prefix.slice(0, -1) } },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      }
    );
    forward.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(forward);
  });
  const authorityPort = await listen(authority);

  // 2. The bridge, exactly as the host runs it.
  bridgePort = 20000 + Math.floor(Math.random() * 20000);
  // A temp cwd keeps the bridge's access log out of the source tree.
  const bridge = spawn("node", ["-e", source, String(bridgePort)], {
    env: { ...process.env, FORGE_SVC_AUTHORITY: `http://127.0.0.1:${authorityPort}` },
    stdio: ["ignore", "ignore", "pipe"],
    cwd: tmpdir(),
  });
  const stderr = [];
  bridge.stderr.on("data", (chunk) => stderr.push(String(chunk)));
  const started = Date.now();
  let health = null;
  while (Date.now() - started < 5000 && !health) {
    try {
      health = await fetch(`http://127.0.0.1:${bridgePort}/health`).then((r) => r.json());
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  check("bridge starts and answers /health", health?.ok === true, JSON.stringify(health));

  const direct = (route, init = {}) => fetch(`http://127.0.0.1:${bridgePort}${route}`, init);
  const viaProxy = (route, init = {}) =>
    fetch(`http://127.0.0.1:${authorityPort}/svc/forge/github-bridge/${route.replace(/^\//, "")}${route.includes("?") ? "&" : "?"}token=${GOOD_TOKEN}`, {
      ...init,
      headers: { ...(init.headers ?? {}), authorization: `Bearer ${GOOD_TOKEN}` },
    });

  // 3. Checks.
  let r = await direct("/whoami");
  check("no token → 401", r.status === 401);
  r = await direct("/whoami", { headers: { authorization: `Bearer ${BAD_TOKEN}` } });
  check("unknown token → 401 (loopback validation rejects)", r.status === 401);
  r = await direct("/whoami", { headers: { authorization: `Bearer ${GOOD_TOKEN}`, "x-forwarded-prefix": "/svc/forge/github-bridge" } });
  check("valid token presented directly (as through the gate) → 200", r.status === 200, await r.clone().text());
  const who = await r.json().catch(() => null);
  check("whoami reports a credential", who && who.mode !== "none", JSON.stringify(who));

  r = await viaProxy("/local/repos");
  const local = await r.json().catch(() => null);
  check("local repos scan", r.status === 200 && Array.isArray(local?.repositories), `${local?.repositories?.length ?? "?"} repositories`);

  r = await viaProxy("/gh/rate_limit");
  check("route outside the allowlist → 403", r.status === 403, await r.text());
  // Dot segments are normalized away by URL parsing before any server sees
  // them; an encoded slash is the shape that must be refused as unclean.
  r = await viaProxy("/gh/repos/o%2Fr/issues");
  check("percent-encoded path characters → 400", r.status === 400, await r.text());

  const target = repo ?? local?.repositories?.map((x) => /github\.com[/:]([^/]+\/[^/.]+)/.exec(x.origin)?.[1]).find(Boolean) ?? null;
  if (target) {
    r = await viaProxy(`/gh/search/issues?q=${encodeURIComponent(`repo:${target} is:pr`)}&per_page=1`);
    const body = await r.json().catch(() => null);
    check(`GitHub search through the bridge for ${target}`, r.status === 200 && typeof body?.total_count === "number", `status ${r.status}, upstream=${r.headers.get("x-forge-upstream")}, total_count=${body?.total_count ?? body?.message}`);
    r = await viaProxy(`/gh/repos/${target}/labels?per_page=2`);
    check(`GitHub REST read through the bridge for ${target}`, r.status === 200 || r.status === 403 || r.status === 404, `status ${r.status}`);
  } else {
    check("a GitHub repo to read (pass owner/repo as an argument)", false, "none detected under /workspace");
  }

  r = await direct("/gh/user", { method: "DELETE", headers: { authorization: `Bearer ${GOOD_TOKEN}` } });
  check("DELETE anywhere → 403", r.status === 403);

  bridge.kill("SIGTERM");
  authority.close();
  if (failures > 0) {
    console.error(`\n${failures} check(s) failed. Bridge stderr:\n${stderr.join("")}`);
    process.exit(1);
  }
  console.log("\nall checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
