/**
 * GitHub-flavored body cleanup for the SDK Markdown renderer.
 *
 * Forge bodies (especially bot-authored ones: dependabot, vercel,
 * release notes) lean on HTML and invisible-comment tricks the SDK's
 * lightweight parser doesn't speak, which then render as literal text
 * ("<br />", "[//]: # (dependabot-automerge-start)", raw <picture>
 * blocks). This module rewrites those patterns into constructs the SDK
 * renderer understands, and drops the ones that are pure metadata.
 * Pure string -> string; no DOM, no sanitization concerns (the SDK
 * renderer already refuses raw HTML and unsafe URLs).
 */

/** `[//]: # (comment)` and other link-reference-definition comments. */
const COMMENT_DEF_RE = /^\[[^\]]*\]:\s*#.*$/gm;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
const BR_RE = /<br\s*\/?>/gi;
const HR_RE = /^<hr\s*\/?>\s*$/gim;
/** <picture> wrappers: keep only the fallback <img>, drop the sources. */
const PICTURE_RE = /<picture[^>]*>([\s\S]*?)<\/picture>/gi;
const SOURCE_TAG_RE = /<source[^>]*\/?>/gi;
/** HTML <img>, converted to markdown image syntax. */
const IMG_TAG_RE = /<img[^>]*>/gi;
const ATTR_RE = (name: string) =>
  new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
/** HTML anchors, converted to markdown links. */
const A_TAG_RE =
  /<a\s[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
/**
 * Badge pattern: an image nested inside a link. The SDK parser doesn't
 * nest, and a badge image adds nothing in a side panel — keep the link,
 * titled by the image's alt text.
 */
const IMAGE_IN_LINK_RE = /\[!\[([^\]]*)\]\([^)]*\)\]\(([^)\s]+)[^)]*\)/g;

function attrOf(tag: string, name: string): string {
  const match = ATTR_RE(name).exec(tag);
  return match?.[1] ?? match?.[2] ?? "";
}

/**
 * Percent-encode parentheses inside markdown link destinations. CommonMark
 * allows BALANCED parens in a destination ("[x](https://a/b(c)d)") and
 * GitHub comments use them heavily (agent deep links with code snippets in
 * query params), but the SDK's lightweight parser stops at the first ")",
 * spilling the rest of the URL as literal text. Walk each "](", consume
 * the destination with paren-depth tracking, and re-emit it with parens
 * encoded so the naive parser sees one clean token. Unbalanced or
 * line-broken destinations are left untouched.
 */
function encodeLinkDestinationParens(input: string): string {
  let result = "";
  let i = 0;
  while (i < input.length) {
    const open = input.indexOf("](", i);
    if (open === -1) {
      result += input.slice(i);
      break;
    }
    result += input.slice(i, open + 2);
    let j = open + 2;
    let depth = 1;
    while (j < input.length) {
      const ch = input[j];
      if (ch === "\n") break;
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) break;
      }
      j++;
    }
    if (depth === 0) {
      result +=
        input
          .slice(open + 2, j)
          .replace(/\(/g, "%28")
          .replace(/\)/g, "%29") + ")";
      i = j + 1;
    } else {
      // Never closed on this line: not a well-formed destination; leave
      // the text alone rather than eating the rest of the body.
      i = open + 2;
    }
  }
  return result;
}

/** Rewrite a forge body into SDK-renderable markdown. */
export function normalizeForgeMarkdown(body: string): string {
  // Normalize line endings first. GitHub/GitLab return bodies with CRLF;
  // the SDK Markdown parser splits on \n, leaving a trailing \r on every
  // line that breaks $-anchored block matchers (headers, hr, etc.) — so a
  // "## Summary" line renders as literal text. Strip \r before anything
  // else looks at line structure.
  let out = body.replace(/\r\n?/g, "\n");

  // Invisible metadata first, so later passes never see it.
  out = out.replace(HTML_COMMENT_RE, "");
  out = out.replace(COMMENT_DEF_RE, "");

  // <picture> keeps only its <img> fallback.
  out = out.replace(PICTURE_RE, (_m, inner: string) =>
    inner.replace(SOURCE_TAG_RE, "").trim()
  );

  // Inline emphasis/code first: they commonly nest INSIDE anchors
  // (<a><code>sha</code></a>), and the anchor pass strips any tags left
  // in its label text.
  out = out.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, "**$2**");
  out = out.replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, "*$2*");
  out = out.replace(/<code>([\s\S]*?)<\/code>/gi, "`$1`");

  // HTML img/a to their markdown equivalents (empty alt/href degrade to
  // something readable rather than an empty token).
  out = out.replace(IMG_TAG_RE, (tag) => {
    const src = attrOf(tag, "src");
    if (!src) return "";
    const alt = attrOf(tag, "alt") || "image";
    return `![${alt}](${src})`;
  });
  out = out.replace(
    A_TAG_RE,
    (
      _m,
      hrefA: string | undefined,
      hrefB: string | undefined,
      text: string
    ) => {
      const href = hrefA ?? hrefB ?? "";
      const label = text.replace(/<[^>]+>/g, "").trim() || href;
      return href ? `[${label}](${href})` : label;
    }
  );

  // Badges: [![alt](img)](href) -> [alt](href).
  out = out.replace(
    IMAGE_IN_LINK_RE,
    (_m, alt: string, href: string) => `[${alt.trim() || href}](${href})`
  );

  // HTML block structure to markdown. Dependabot's release-notes and
  // commit sections inside <details> are pure HTML (<ul><li>,
  // <blockquote>, <p><em>...), which the SDK parser shows literally.
  // Heuristic flat conversion — nested lists degrade to flat bullets,
  // which reads fine in a side panel.
  out = out.replace(
    /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
    (_m, level: string, text: string) =>
      `\n\n${"#".repeat(Math.min(Number(level), 3))} ${text.trim()}\n\n`
  );
  out = out.replace(
    /<li[^>]*>([\s\S]*?)<\/li>/gi,
    (_m, text: string) => `\n- ${text.trim()}`
  );
  // List/quote/paragraph wrappers become plain paragraph breaks; their
  // inner structure was already converted above.
  out = out.replace(/<\/?(ul|ol|blockquote|p|div|span|tt)[^>]*>/gi, (tag) =>
    /^<\/?(span|tt)/i.test(tag) ? "" : "\n\n"
  );

  // Simple layout tags.
  out = out.replace(BR_RE, "\n");
  out = out.replace(HR_RE, "\n---\n");

  // Last, once every link (authored or converted above) is in markdown
  // form: make parenthesized destinations survive the naive link parser.
  out = encodeLinkDestinationParens(out);

  // Collapse the whitespace holes the removals leave behind, and pull
  // consecutive converted bullets back into one list (the source HTML's
  // inter-<li> newlines otherwise read as paragraph breaks).
  out = out.replace(/\n{3,}/g, "\n\n");
  out = out.replace(/(\n- [^\n]*)\n+(?=\n- )/g, "$1");
  return out.trim();
}
