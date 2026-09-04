import { defineConfig } from "vitest/config";

// Unit tests cover the framework-free layers only (types, normalizers,
// route table, query store, bridge). Files that import @soft-machine/sdk
// or react are exercised by the running host, not here.
export default defineConfig({
  test: {
    environment: "node",
    include: ["bindings/**/__tests__/**/*.test.ts"],
  },
});
