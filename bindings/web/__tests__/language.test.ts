import { describe, expect, it } from "vitest";
import { languageForFile } from "../highlight/language";

describe("languageForFile", () => {
  it("maps common extensions", () => {
    expect(languageForFile("src/a.ts")).toBe("typescript");
    expect(languageForFile("src/App.tsx")).toBe("tsx");
    expect(languageForFile("README.md")).toBe("markdown");
    expect(languageForFile("FUNDING.json")).toBe("json");
    expect(languageForFile("deep/path/thing.YAML")).toBe("yaml");
    expect(languageForFile("main.rs")).toBe("rust");
  });

  it("maps special basenames and ignores case", () => {
    expect(languageForFile("Dockerfile")).toBe("docker");
    expect(languageForFile("tools/Makefile")).toBe("makefile");
    expect(languageForFile(".gitignore")).toBe("ini");
  });

  it("returns null for unknown or extension-less files", () => {
    expect(languageForFile("LICENSE")).toBeNull();
    expect(languageForFile("a.unknownext")).toBeNull();
    expect(languageForFile("bin/blob.bin")).toBeNull();
  });
});
