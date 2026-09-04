#!/usr/bin/env node
/**
 * Copies bindings/vm/github-bridge.js verbatim into the manifest's machine
 * service declaration (`node -e <source> {{port}}`).
 *
 * Why inline: a published plugin artifact carries the manifest and the
 * built browser bundle only, so a service that points at a source file on
 * disk would start in every dev workspace and fail everywhere else. The
 * readable file stays the source of truth; this script and
 * __tests__/manifestParity.test.ts keep the two in lock-step.
 *
 * Usage: node scripts/sync-manifest.mjs [--check]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "soft-machine.plugin.json");
const bridgePath = join(root, "bindings", "vm", "github-bridge.js");

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const source = readFileSync(bridgePath, "utf8");

const service = manifest.machine?.services?.find((s) => s.id === "github-bridge");
if (!service) {
  console.error("sync-manifest: manifest has no machine.services entry with id github-bridge");
  process.exit(1);
}

const nextArgs = ["-e", source, "{{port}}"];
const upToDate =
  service.command === "node" &&
  JSON.stringify(service.args) === JSON.stringify(nextArgs);

if (process.argv.includes("--check")) {
  if (!upToDate) {
    console.error("sync-manifest: soft-machine.plugin.json is out of date; run `node scripts/sync-manifest.mjs`");
    process.exit(1);
  }
  console.log("sync-manifest: manifest matches bindings/vm/github-bridge.js");
  process.exit(0);
}

service.command = "node";
service.args = nextArgs;
service.startup = service.startup ?? "on-demand";
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`sync-manifest: wrote ${manifestPath} (${source.length} chars of bridge source)`);
