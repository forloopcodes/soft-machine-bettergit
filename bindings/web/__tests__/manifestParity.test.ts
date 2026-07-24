/**
 * Forge ships two copies of its cold metadata: FORGE_META (what the module
 * registers warm) and soft-machine.plugin.json (what the VM plugin-service
 * and the store publish pipeline read cold, before any code runs). Drift
 * between them produces different panel layouts cold vs warm and a store
 * listing that misdescribes the mounted plugin — this test pins them equal.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FORGE_META } from "../meta";

const manifest = JSON.parse(
  readFileSync(
    join(__dirname, "..", "..", "..", "soft-machine.plugin.json"),
    "utf8"
  )
) as Record<string, unknown>;

describe("forge manifest parity", () => {
  it("mirrors FORGE_META field for field", () => {
    expect(manifest.id).toBe(FORGE_META.id);
    expect(manifest.label).toBe(FORGE_META.label);
    expect(manifest.shortLabel).toBe(FORGE_META.shortLabel);
    expect(manifest.color).toBe(FORGE_META.color);
    expect(manifest.description).toBe(FORGE_META.description);
    expect(manifest.integrations).toEqual(FORGE_META.integrations);
    expect(manifest.panels).toEqual(FORGE_META.panels);
  });

  it("points its module entry inside the plugin directory", () => {
    expect(manifest.module).toBe("bindings/web/module.ts");
  });
});
