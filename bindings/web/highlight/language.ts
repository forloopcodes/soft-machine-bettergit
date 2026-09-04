/**
 * File name → Prism language id. Pure, so the mapping is testable without
 * loading Prism. Unknown files return null and render as plain text.
 */

const BY_EXTENSION: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  json: "json",
  jsonc: "json",
  json5: "json",
  md: "markdown",
  mdx: "markdown",
  markdown: "markdown",
  css: "css",
  scss: "scss",
  html: "markup",
  htm: "markup",
  xml: "markup",
  svg: "markup",
  vue: "markup",
  svelte: "markup",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  ini: "ini",
  py: "python",
  go: "go",
  rs: "rust",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  sql: "sql",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  swift: "swift",
  rb: "ruby",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  graphql: "graphql",
  gql: "graphql",
  diff: "diff",
  patch: "diff",
};

const BY_BASENAME: Record<string, string> = {
  dockerfile: "docker",
  makefile: "makefile",
  ".bashrc": "bash",
  ".zshrc": "bash",
  ".gitignore": "ini",
  ".env": "ini",
  ".editorconfig": "ini",
};

export function languageForFile(filename: string): string | null {
  const base = filename.slice(filename.lastIndexOf("/") + 1).toLowerCase();
  if (BY_BASENAME[base]) return BY_BASENAME[base];
  const dot = base.lastIndexOf(".");
  if (dot < 0) return null;
  return BY_EXTENSION[base.slice(dot + 1)] ?? null;
}
