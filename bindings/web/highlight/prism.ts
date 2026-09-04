/**
 * Prism, loaded once with the grammars the diff viewer needs. Components
 * register on the Prism instance the core exposes globally, so the core
 * import must come first and dependents after their dependencies
 * (tsx needs jsx + typescript; cpp needs c; scss needs css; …).
 *
 * Highlighting is per line: a diff shows fragments, so multi-line
 * constructs (block comments, template strings) may lose their state at
 * hunk edges. That is the trade GitHub's own compact diff view makes too.
 */

import Prism, { type Token } from "prismjs";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-json";
import "prismjs/components/prism-json5";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-scss";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-toml";
import "prismjs/components/prism-ini";
import "prismjs/components/prism-python";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-java";
import "prismjs/components/prism-kotlin";
import "prismjs/components/prism-swift";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-graphql";
import "prismjs/components/prism-diff";
import "prismjs/components/prism-docker";
import "prismjs/components/prism-makefile";

// The core schedules a DOM-wide highlightAll on the next frame unless told
// otherwise; this plugin never uses Prism's DOM mode.
(Prism as unknown as { manual: boolean }).manual = true;

/** Lines longer than this are shown plain; tokenizing them costs more than
 *  it shows (minified bundles, embedded blobs). */
const LINE_MAX = 2_000;

export type { Token };
export type TokenList = Array<string | Token>;

/** Tokens for one line, or null when the language is unknown or the line
 *  is not worth highlighting. */
export function tokenizeLine(text: string, language: string | null): TokenList | null {
  if (!language || text.length === 0 || text.length > LINE_MAX) return null;
  const grammar = Prism.languages[language];
  if (!grammar) return null;
  try {
    return Prism.tokenize(text, grammar);
  } catch {
    return null;
  }
}
