'use strict';
/*
 * Forge GitHub bridge — the plugin's machine service.
 *
 * Runs on the workspace VM (declared under `machine.services` in
 * soft-machine.plugin.json; the host starts it on demand and hands the
 * browser a token-gated URL through `usePluginService`). It turns the
 * workspace's own GitHub credential — whatever `gh` is signed in with, i.e.
 * the GitHub App connection or a GH_TOKEN from Settings → Integrations —
 * into a narrow HTTP surface the browser panels can call:
 *
 *   GET  /health            liveness, unauthenticated, reveals nothing
 *   GET  /whoami            which kind of GitHub credential gh holds
 *   GET  /local/repos       git origins under /workspace (auto-detection)
 *   *    /gh/<path>?<qs>    allowlisted api.github.com routes, auth injected
 *
 * Security model
 * --------------
 * The host reaches this process at 127.0.0.1:<port> through TWO proxies:
 * the token-gated `/svc/bettergit/github-bridge/` route (what `usePluginService`
 * gives the browser) and the unauthenticated public port forward
 * (`https://<port>-<workspace>.soft-machine.io`). Because the second one
 * exists, every request here must prove it came through the first: callers
 * present the `sc_` service token as `Authorization: Bearer`, and the bridge
 * validates it by asking the workspace server on loopback to proxy a nonce
 * back to us through that same token gate. Forwarded headers are NOT
 * trusted — the public forward passes client headers through verbatim.
 *
 * The GitHub token never leaves this process: it is read from `gh auth
 * token` on demand and attached only to requests bound for api.github.com.
 *
 * Node 18+, no dependencies. Kept as a single readable file; the manifest
 * carries a verbatim copy in its service args (scripts/sync-manifest.mjs),
 * because published plugin artifacts ship the manifest and bundle only.
 */
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const PLUGIN_ID = 'bettergit';
const SERVICE_ID = 'github-bridge';
/** Workspace server that mints and validates `sc_` service tokens. */
const AUTHORITY = (process.env.FORGE_SVC_AUTHORITY || 'http://127.0.0.1:8080').replace(/\/$/, '');
const GITHUB_API = 'https://api.github.com';
const WORKSPACE_ROOT = process.env.FORGE_WORKSPACE_ROOT || '/workspace';
const USER_AGENT = 'soft-machine-forge-bridge';

const SERVICE_TOKEN_RE = /^sc_[A-Za-z0-9_-]{16,}$/;
const NONCE_RE = /^[0-9a-f]{32}$/;
/** A credential is one printable, whitespace-free run (ghp_/ghs_/github_pat_
 *  tokens and the dotted GitHub App tokens alike); anything else is a
 *  message from gh, not a token. */
const GH_TOKEN_RE = /^[\x21-\x7e]{20,}$/;

const VALID_TOKEN_TTL_MS = 5 * 60_000;
const REJECTED_TOKEN_TTL_MS = 30_000;
const AUTH_ROUNDTRIP_TIMEOUT_MS = 5_000;
const GH_TOKEN_TTL_MS = 5 * 60_000;
const WHOAMI_TTL_MS = 60_000;
const LOCAL_REPOS_TTL_MS = 30_000;
const UPSTREAM_TIMEOUT_MS = 30_000;
const BODY_LIMIT_BYTES = 256 * 1024;

// ── Small helpers ──────────────────────────────────────────────────────────

/**
 * Operational log: stderr (captured by the host as the service log) plus
 * `bridge.log` in the per-service data directory the host starts us in, so
 * anyone on the machine can see the bridge working without host access.
 * Lines never contain tokens or query strings; the file is capped.
 */
const LOG_FILE = path.join(process.cwd(), 'bridge.log');
const LOG_FILE_MAX_BYTES = 256 * 1024;
function log(line) {
  const text = `${new Date().toISOString()} ${line}\n`;
  process.stderr.write(`forge github-bridge: ${line}\n`);
  try {
    let size = 0;
    try {
      size = fs.statSync(LOG_FILE).size;
    } catch {
      /* no file yet */
    }
    if (size > LOG_FILE_MAX_BYTES) fs.writeFileSync(LOG_FILE, text);
    else fs.appendFileSync(LOG_FILE, text);
  } catch {
    /* read-only cwd: stderr still has it */
  }
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  });
  res.end(text);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('body too large'), { code: 'payload_too_large' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Minimal GET returning the status code, for the loopback auth check. */
function fetchStatus(url, timeoutMs) {
  return new Promise((resolve) => {
    const target = new URL(url);
    const lib = target.protocol === 'https:' ? https : http;
    const req = lib.request(
      target,
      { method: 'GET', headers: { 'user-agent': USER_AGENT }, timeout: timeoutMs },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode || 0));
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve(0));
    req.end();
  });
}

// ── Service-token validation (loopback round trip) ─────────────────────────

const validTokens = new Map(); // token -> expiresAt
const rejectedTokens = new Map(); // token -> expiresAt
const validating = new Map(); // token -> Promise<boolean>
const pendingNonces = new Map(); // nonce -> resolve(boolean)

function bearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/**
 * A token is genuine iff the workspace server accepts it: we ask it to proxy
 * `/__auth/<nonce>` back to us through the token gate. A 200 AND the nonce
 * arriving here (proving the gate routed to THIS service) validates the
 * token; anything else rejects it. Results are cached briefly both ways.
 */
function validateServiceToken(token) {
  const now = Date.now();
  if (!token || !SERVICE_TOKEN_RE.test(token)) return Promise.resolve(false);
  const okUntil = validTokens.get(token);
  if (okUntil && okUntil > now) return Promise.resolve(true);
  const badUntil = rejectedTokens.get(token);
  if (badUntil && badUntil > now) return Promise.resolve(false);
  const inFlight = validating.get(token);
  if (inFlight) return inFlight;

  const nonce = crypto.randomBytes(16).toString('hex');
  const echoed = new Promise((resolve) => {
    pendingNonces.set(nonce, resolve);
    setTimeout(() => {
      if (pendingNonces.delete(nonce)) resolve(false);
    }, AUTH_ROUNDTRIP_TIMEOUT_MS).unref();
  });
  const url = `${AUTHORITY}/svc/${PLUGIN_ID}/${SERVICE_ID}/__auth/${nonce}?token=${encodeURIComponent(token)}`;

  const check = (async () => {
    const status = await fetchStatus(url, AUTH_ROUNDTRIP_TIMEOUT_MS);
    const seen = status === 200 && (await echoed);
    if (seen) validTokens.set(token, Date.now() + VALID_TOKEN_TTL_MS);
    else rejectedTokens.set(token, Date.now() + REJECTED_TOKEN_TTL_MS);
    validating.delete(token);
    return seen;
  })();
  validating.set(token, check);
  return check;
}

function handleAuthEcho(nonce, res) {
  const resolve = NONCE_RE.test(nonce) ? pendingNonces.get(nonce) : undefined;
  if (resolve) {
    pendingNonces.delete(nonce);
    resolve(true);
  }
  // Always the same answer: the echo route must not leak whether a nonce
  // was pending.
  sendJson(res, 200, { nonce: NONCE_RE.test(nonce) ? nonce : null });
}

// ── GitHub credential (gh) ─────────────────────────────────────────────────

let ghTokenCache = { value: null, at: 0, promise: null };

function readGhToken(force) {
  const now = Date.now();
  if (!force && ghTokenCache.value && now - ghTokenCache.at < GH_TOKEN_TTL_MS) {
    return Promise.resolve(ghTokenCache.value);
  }
  if (ghTokenCache.promise) return ghTokenCache.promise;
  ghTokenCache.promise = new Promise((resolve, reject) => {
    execFile(
      'gh',
      ['auth', 'token', '--hostname', 'github.com'],
      { timeout: 10_000, env: process.env, maxBuffer: 64 * 1024 },
      (err, stdout, stderr) => {
        ghTokenCache.promise = null;
        const token = String(stdout || '').trim();
        if (err || !GH_TOKEN_RE.test(token)) {
          ghTokenCache = { value: null, at: 0, promise: null };
          const why = err
            ? `${err.code || 'exit'}: ${String(stderr || err.message || '').trim().slice(0, 200)}`
            : 'gh printed no token';
          log(`gh auth token failed (${why})`);
          reject(
            Object.assign(new Error(`gh is not signed in to github.com (${why})`), {
              code: err && err.code === 'ENOENT' ? 'gh_unavailable' : 'gh_not_authenticated',
            })
          );
          return;
        }
        ghTokenCache = { value: token, at: Date.now(), promise: null };
        resolve(token);
      }
    );
  });
  return ghTokenCache.promise;
}

/** One buffered call to api.github.com. Resolves for any HTTP status. */
function githubRequest(method, pathWithQuery, body, token) {
  return new Promise((resolve, reject) => {
    const headers = {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': USER_AGENT,
      'x-github-api-version': '2022-11-28',
    };
    if (body) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = Buffer.byteLength(body);
    }
    const req = https.request(
      `${GITHUB_API}${pathWithQuery}`,
      { method, headers, timeout: UPSTREAM_TIMEOUT_MS },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode || 502, headers: res.headers, body: Buffer.concat(chunks) })
        );
        res.on('error', reject);
      }
    );
    req.on('timeout', () => req.destroy(Object.assign(new Error('upstream timeout'), { code: 'github_timeout' })));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const REDIRECT_STATUSES = new Set([301, 302, 307, 308]);
const MAX_REDIRECTS = 3;

/**
 * Where a GitHub redirect points, if we are willing to follow it: same API
 * origin, clean path, and still inside the route allowlist for this method.
 * A renamed or transferred repository redirects every route under its old
 * name to the id-addressed form `/repositories/<id>/…`; that is checked
 * against the allowlist as if it were `/repos/<owner>/<name>/…`.
 */
function resolveRedirect(method, location) {
  if (typeof location !== 'string' || !location) return null;
  let target;
  try {
    target = new URL(location, GITHUB_API);
  } catch {
    return null;
  }
  if (target.origin !== GITHUB_API || !isCleanPath(target.pathname)) return null;
  const canonical = target.pathname.replace(/^\/repositories\/\d{1,12}(?=\/|$)/, '/repos/_/_');
  if (!routeAllowed(method, canonical)) return null;
  return `${target.pathname}${target.search}`;
}

/**
 * Call GitHub; on a 401 refresh the gh token once and retry; follow
 * same-host redirects (renamed or transferred repositories) a few hops.
 */
async function callGithub(method, pathWithQuery, body) {
  let token = await readGhToken(false);
  let target = pathWithQuery;
  let refreshed = false;
  for (let hops = 0; ; hops++) {
    const upstream = await githubRequest(method, target, body, token);
    if (upstream.status === 401 && !refreshed) {
      refreshed = true;
      token = await readGhToken(true);
      continue;
    }
    if (REDIRECT_STATUSES.has(upstream.status) && hops < MAX_REDIRECTS) {
      const next = resolveRedirect(method, upstream.headers.location);
      if (next) {
        target = next;
        continue;
      }
    }
    return upstream;
  }
}

// ── Route allowlist for /gh/* ──────────────────────────────────────────────

const OWNER_REPO = '[A-Za-z0-9_.-]+\\/[A-Za-z0-9_.-]+';
const NUM = '\\d{1,9}';
const SHA = '[0-9a-f]{7,40}';
const rx = (s) => new RegExp(`^${s}$`);
const ALLOWED_ROUTES = [
  ['GET', rx('/user')],
  ['GET', rx('/user/repos')],
  ['GET', rx('/installation/repositories')],
  ['GET', rx('/search/issues')],
  ['GET', rx(`/repos/${OWNER_REPO}`)],
  ['GET', rx(`/repos/${OWNER_REPO}/(issues|pulls|labels|milestones|assignees|branches)`)],
  ['GET', rx(`/repos/${OWNER_REPO}/issues/${NUM}`)],
  ['GET', rx(`/repos/${OWNER_REPO}/issues/${NUM}/comments`)],
  ['GET', rx(`/repos/${OWNER_REPO}/pulls/${NUM}`)],
  ['GET', rx(`/repos/${OWNER_REPO}/pulls/${NUM}/(files|reviews|commits)`)],
  ['GET', rx(`/repos/${OWNER_REPO}/commits/${SHA}/(check-runs|status)`)],
  ['POST', rx(`/repos/${OWNER_REPO}/issues`)],
  ['POST', rx(`/repos/${OWNER_REPO}/pulls`)],
  ['POST', rx(`/repos/${OWNER_REPO}/issues/${NUM}/comments`)],
  ['PATCH', rx(`/repos/${OWNER_REPO}/issues/${NUM}`)],
  ['PATCH', rx(`/repos/${OWNER_REPO}/pulls/${NUM}`)],
  ['PUT', rx(`/repos/${OWNER_REPO}/issues/${NUM}/labels`)],
  ['PUT', rx(`/repos/${OWNER_REPO}/pulls/${NUM}/merge`)],
];

/** Path may only contain URL-safe name characters; no dot segments. */
function isCleanPath(p) {
  return /^\/[A-Za-z0-9_./-]*$/.test(p) && !p.split('/').some((seg) => seg === '.' || seg === '..');
}

function routeAllowed(method, githubPath) {
  return ALLOWED_ROUTES.some(([m, re]) => m === method && re.test(githubPath));
}

const PASSTHROUGH_HEADERS = [
  'content-type',
  'link',
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'x-ratelimit-used',
  'x-github-request-id',
];

async function handleGithubProxy(req, res, url) {
  const githubPath = url.pathname.slice('/gh'.length) || '/';
  if (!isCleanPath(githubPath)) return sendJson(res, 400, { error: 'bad_path' });
  if (!routeAllowed(req.method, githubPath)) return sendJson(res, 403, { error: 'route_not_allowed' });

  let body = null;
  if (req.method !== 'GET') {
    let raw;
    try {
      raw = await readBody(req, BODY_LIMIT_BYTES);
    } catch (err) {
      return sendJson(res, err.code === 'payload_too_large' ? 413 : 400, { error: err.code || 'bad_body' });
    }
    if (raw.length > 0) {
      try {
        JSON.parse(raw.toString('utf8'));
      } catch {
        return sendJson(res, 400, { error: 'bad_json' });
      }
      body = raw;
    }
  }

  let upstream;
  try {
    upstream = await callGithub(req.method, `${githubPath}${url.search}`, body);
  } catch (err) {
    const code = err && err.code ? err.code : 'github_unreachable';
    const status = code === 'gh_not_authenticated' || code === 'gh_unavailable' ? 503 : 502;
    return sendJson(res, status, { error: code, message: err && err.message ? err.message : String(err) });
  }

  const headers = { 'cache-control': 'no-store', 'x-forge-upstream': 'github' };
  for (const name of PASSTHROUGH_HEADERS) {
    if (upstream.headers[name] !== undefined) headers[name] = upstream.headers[name];
  }
  headers['content-length'] = upstream.body.length;
  res.writeHead(upstream.status, headers);
  res.end(upstream.body);
}

// ── /whoami ────────────────────────────────────────────────────────────────

let whoamiCache = { at: 0, value: null };

async function computeWhoami() {
  let token;
  try {
    token = await readGhToken(false);
  } catch (err) {
    return { mode: 'none', error: err.code || 'gh_not_authenticated' };
  }
  const user = await githubRequest('GET', '/user', null, token);
  if (user.status === 200) {
    let parsed = {};
    try {
      parsed = JSON.parse(user.body.toString('utf8'));
    } catch {
      /* fall through with empty identity */
    }
    return { mode: 'user', login: typeof parsed.login === 'string' ? parsed.login : null };
  }
  if (user.status === 401) {
    return { mode: 'none', error: 'github_unauthorized' };
  }
  // A GitHub App installation token cannot read /user (403); confirm it can
  // list its installation instead.
  const installation = await githubRequest('GET', '/installation/repositories?per_page=1', null, token);
  if (installation.status === 200) {
    let count = null;
    try {
      const parsed = JSON.parse(installation.body.toString('utf8'));
      if (typeof parsed.total_count === 'number') count = parsed.total_count;
    } catch {
      /* count stays null */
    }
    return { mode: 'installation', login: null, repositoryCount: count };
  }
  return { mode: 'none', error: `github_${installation.status}` };
}

async function handleWhoami(res) {
  const now = Date.now();
  if (whoamiCache.value && now - whoamiCache.at < WHOAMI_TTL_MS) {
    return sendJson(res, 200, whoamiCache.value);
  }
  try {
    const value = await computeWhoami();
    whoamiCache = { at: Date.now(), value };
    sendJson(res, 200, value);
  } catch (err) {
    sendJson(res, 502, { mode: 'none', error: (err && err.code) || 'github_unreachable' });
  }
}

// ── /local/repos ───────────────────────────────────────────────────────────

let localReposCache = { at: 0, value: null };

/** Strip embedded credentials: https://user:token@host/... -> https://host/... */
function scrubUrl(url) {
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/i, '$1');
}

function gitConfigPath(repoDir) {
  const dotGit = path.join(repoDir, '.git');
  let st;
  try {
    st = fs.statSync(dotGit);
  } catch {
    return null;
  }
  if (st.isDirectory()) return path.join(dotGit, 'config');
  if (!st.isFile()) return null;
  // Worktree / submodule pointer: "gitdir: <path>"
  let pointer;
  try {
    pointer = fs.readFileSync(dotGit, 'utf8');
  } catch {
    return null;
  }
  const match = /^gitdir:\s*(.+)\s*$/m.exec(pointer);
  if (!match) return null;
  const gitDir = path.resolve(repoDir, match[1].trim());
  try {
    const common = fs.readFileSync(path.join(gitDir, 'commondir'), 'utf8').trim();
    return path.join(path.resolve(gitDir, common), 'config');
  } catch {
    return path.join(gitDir, 'config');
  }
}

function readOriginUrl(repoDir) {
  const configPath = gitConfigPath(repoDir);
  if (!configPath) return null;
  let text;
  try {
    text = fs.readFileSync(configPath, 'utf8');
  } catch {
    return null;
  }
  let inOrigin = false;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('[')) {
      inOrigin = /^\[remote\s+"origin"\]$/i.test(line);
      continue;
    }
    if (!inOrigin) continue;
    const match = /^url\s*=\s*(.+)$/i.exec(line);
    if (match) return scrubUrl(match[1].trim());
  }
  return null;
}

function scanLocalRepos() {
  const found = [];
  const visit = (dir, depth) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      let st;
      try {
        st = fs.statSync(full); // follows symlinks on purpose
      } catch {
        continue;
      }
      if (!st.isDirectory()) continue;
      const origin = readOriginUrl(full);
      if (origin) found.push({ path: full, origin });
      else if (depth < 2) visit(full, depth + 1);
    }
  };
  visit(WORKSPACE_ROOT, 1);
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

function handleLocalRepos(res) {
  const now = Date.now();
  if (localReposCache.value && now - localReposCache.at < LOCAL_REPOS_TTL_MS) {
    return sendJson(res, 200, { repositories: localReposCache.value });
  }
  const repositories = scanLocalRepos();
  localReposCache = { at: now, value: repositories };
  sendJson(res, 200, { repositories });
}

// ── Server ─────────────────────────────────────────────────────────────────

async function handle(req, res) {
  const url = new URL(req.url || '/', 'http://bridge.local');

  if (req.method === 'OPTIONS') {
    // Preflights are answered by the /svc proxy; be harmless if one lands.
    res.writeHead(204, { 'cache-control': 'no-store' });
    return res.end();
  }
  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { ok: true, service: `${PLUGIN_ID}/${SERVICE_ID}` });
  }
  if (req.method === 'GET' && url.pathname.startsWith('/__auth/')) {
    return handleAuthEcho(url.pathname.slice('/__auth/'.length), res);
  }

  if (!(await validateServiceToken(bearerToken(req)))) {
    return sendJson(res, 401, { error: 'unauthorized' });
  }

  if (req.method === 'GET' && url.pathname === '/whoami') return handleWhoami(res);
  if (req.method === 'GET' && url.pathname === '/local/repos') return handleLocalRepos(res);
  if (url.pathname === '/gh' || url.pathname.startsWith('/gh/')) return handleGithubProxy(req, res, url);
  return sendJson(res, 404, { error: 'not_found' });
}

function start() {
  const port = Number(process.argv[1] || process.env.PORT);
  if (!Number.isInteger(port) || port <= 0) {
    log('a listen port is required');
    process.exit(2);
  }
  const server = http.createServer((req, res) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      // One access line per request: method, path (no query string — it can
      // carry search text), status, latency. Auth echoes are noise.
      const pathname = (req.url || '/').split('?')[0];
      if (pathname.startsWith('/__auth/')) return;
      log(`${req.method} ${pathname} -> ${res.statusCode} (${Date.now() - startedAt}ms)`);
    });
    handle(req, res).catch((err) => {
      log(`error: ${err && err.stack ? err.stack : err}`);
      if (!res.headersSent) sendJson(res, 500, { error: 'bridge_failure' });
      else res.end();
    });
  });
  server.requestTimeout = UPSTREAM_TIMEOUT_MS + 10_000;
  // Loopback only: both host proxies dial 127.0.0.1, and nothing else should.
  server.listen(port, '127.0.0.1', () => {
    log(`listening on 127.0.0.1:${port} (pid ${process.pid})`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  return server;
}

// Start only when run as a program: `node -e <source> <port>` (how the host
// runs it; the module id is "[eval]") or `node github-bridge.js <port>`. A
// test harness requiring this file gets the internals without a listener.
if (module.id === '[eval]' || require.main === module) {
  start();
}

module.exports = {
  ALLOWED_ROUTES,
  bearerToken,
  computeWhoami,
  isCleanPath,
  readGhToken,
  readOriginUrl,
  resolveRedirect,
  routeAllowed,
  scanLocalRepos,
  scrubUrl,
  start,
};
