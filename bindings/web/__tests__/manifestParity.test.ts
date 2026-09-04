/**
 * Forge ships its cold metadata twice — FORGE_META (registered warm by the
 * module) and soft-machine.plugin.json (read cold by the VM plugin-service
 * and the store) — and its bridge twice: bindings/vm/github-bridge.js (the
 * readable source) and the manifest's service args (what the host actually
 * runs, because published artifacts carry only manifest + bundle). Drift in
 * either pair fails invisibly, so this test pins both.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FORGE_META } from "../meta";

const root = join(__dirname, "..", "..", "..");
const manifest = JSON.parse(readFileSync(join(root, "soft-machine.plugin.json"), "utf8")) as Record<
  string,
  unknown
>;

describe("forge manifest parity", () => {
  it("mirrors FORGE_META field for field", () => {
    expect(manifest.id).toBe(FORGE_META.id);
    expect(manifest.label).toBe(FORGE_META.label);
    expect(manifest.shortLabel).toBe(FORGE_META.shortLabel);
    expect(manifest.color).toBe(FORGE_META.color);
    expect(manifest.description).toBe(FORGE_META.description);
    expect(manifest.integrations).toEqual(FORGE_META.integrations);
    expect(manifest.panels).toEqual(FORGE_META.panels);
    expect(manifest.panelExtensions).toEqual([]);
  });

  it("points its module entry inside the plugin directory", () => {
    expect(manifest.module).toBe("bindings/web/module.ts");
  });

  it("declares only the GitHub integration", () => {
    const sites = (manifest.integrations as Array<{ site: string }>).map((i) => i.site);
    expect(sites).toEqual(["github.com"]);
  });

  it("runs the bridge source verbatim as its machine service", () => {
    const source = readFileSync(join(root, "bindings", "vm", "github-bridge.js"), "utf8");
    const machine = manifest.machine as { services: Array<Record<string, unknown>> };
    expect(machine.services).toHaveLength(1);
    const [service] = machine.services;
    expect(service.id).toBe("github-bridge");
    expect(service.command).toBe("node");
    expect(service.startup).toBe("on-demand");
    expect(service.args).toEqual(["-e", source, "{{port}}"]);
  });
});
