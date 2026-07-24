/**
 * Tests for normalizeForgeMarkdown against the real bot-authored body
 * shapes that broke rendering: dependabot's invisible-comment markers and
 * badge links, vercel's <picture> blocks, literal <br /> tags. Every
 * assertion checks BOTH that the artifact is gone and that the useful
 * content survived.
 */

import { describe, expect, it } from "vitest";
import { normalizeForgeMarkdown } from "../markdownNormalize";

const DEPENDABOT_BODY = `Bumps [serde_json](https://github.com/serde-rs/json) from 1.0.149 to 1.0.151.
<details>
<summary>Release notes</summary>
<p><em>Sourced from releases.</em></p>
</details>
<br />

[![Dependabot compatibility score](https://dependabot-badges.githubapp.com/badges/compatibility_score?dependency-name=serde_json)](https://docs.github.com/en/github/managing-security-vulnerabilities/about-dependabot-security-updates#about-compatibility-scores)

Dependabot will resolve any conflicts with this PR as long as you don't alter it yourself.

[//]: # (dependabot-automerge-start)
[//]: # (dependabot-automerge-end)

<details>
<summary>Dependabot commands and options</summary>
You can trigger Dependabot actions by commenting on this PR
</details>`;

describe("normalizeForgeMarkdown", () => {
  it("drops [//]: # comment markers entirely", () => {
    const out = normalizeForgeMarkdown(DEPENDABOT_BODY);
    expect(out).not.toContain("[//]:");
    expect(out).not.toContain("dependabot-automerge");
  });

  it("removes <br /> without eating surrounding content", () => {
    const out = normalizeForgeMarkdown(DEPENDABOT_BODY);
    expect(out).not.toMatch(/<br\s*\/?>/i);
    expect(out).toContain("Dependabot will resolve any conflicts");
  });

  it("converts badge image-in-link to a plain link with the alt text", () => {
    const out = normalizeForgeMarkdown(DEPENDABOT_BODY);
    expect(out).not.toContain("[![");
    expect(out).toContain(
      "[Dependabot compatibility score](https://docs.github.com/en/github/managing-security-vulnerabilities/about-dependabot-security-updates#about-compatibility-scores)"
    );
  });

  it("keeps <details>/<summary> blocks (the SDK renders them)", () => {
    const out = normalizeForgeMarkdown(DEPENDABOT_BODY);
    expect(out).toContain("<summary>Release notes</summary>");
    expect(out).toContain("<summary>Dependabot commands and options</summary>");
  });

  it("strips HTML comments", () => {
    expect(
      normalizeForgeMarkdown("before <!-- hidden\nmultiline --> after")
    ).toBe("before  after");
  });

  it("unwraps <picture> to its <img> fallback as markdown", () => {
    const out = normalizeForgeMarkdown(
      `<picture><source media="(prefers-color-scheme: dark)" srcset="https://x.test/dark.svg"><img alt="Review" src="https://x.test/light.svg"></picture>`
    );
    expect(out).toBe("![Review](https://x.test/light.svg)");
    expect(out).not.toContain("<source");
  });

  it("converts HTML anchors to markdown links", () => {
    expect(
      normalizeForgeMarkdown('<a href="https://x.test/pr">View PR</a>')
    ).toBe("[View PR](https://x.test/pr)");
  });

  it("drops src-less imgs and collapses the whitespace holes", () => {
    const out = normalizeForgeMarkdown("a\n\n<img alt=orphan>\n\n\n\nb");
    expect(out).toBe("a\n\nb");
  });

  it("converts dependabot's HTML release notes to markdown", () => {
    const out = normalizeForgeMarkdown(
      `<p><em>Sourced from <a href="https://github.com/serde-rs/json/releases">serde_json's releases</a>.</em></p>
<blockquote>
<h2>v1.0.151</h2>
<ul>
<li>Add RawValue::from_string_unchecked (<a href="https://redirect.github.com/serde-rs/json/issues/1331">#1331</a>, thanks <a href="https://github.com/WonderLawrence"><code>@WonderLawrence</code></a>)</li>
<li>Reject non-string enum object keys</li>
</ul>
</blockquote>`
    );
    // No raw HTML structure survives.
    expect(out).not.toMatch(/<(p|em|ul|li|blockquote|h2|a|code)[ >]/);
    // The content converted, not vanished.
    expect(out).toContain(
      "*Sourced from [serde_json's releases](https://github.com/serde-rs/json/releases).*"
    );
    expect(out).toContain("## v1.0.151");
    expect(out).toContain(
      "- Add RawValue::from_string_unchecked ([#1331](https://redirect.github.com/serde-rs/json/issues/1331), thanks [`@WonderLawrence`](https://github.com/WonderLawrence))"
    );
    expect(out).toContain("- Reject non-string enum object keys");
  });

  it("converts HTML commit lists to bullets", () => {
    const out = normalizeForgeMarkdown(
      "<ul>\n<li><a href='https://x.test/c/de85007'><code>de85007</code></a> Release 1.0.151</li>\n<li>Additional commits viewable in <a href='https://x.test/compare'>compare view</a></li>\n</ul>"
    );
    expect(out).toBe(
      "- [`de85007`](https://x.test/c/de85007) Release 1.0.151\n- Additional commits viewable in [compare view](https://x.test/compare)"
    );
  });

  it("encodes balanced parens inside link destinations (agent deep links)", () => {
    // The real failure shape: a claude-bot "Fix this" link whose query
    // param embeds a code snippet with literal parentheses.
    const out = normalizeForgeMarkdown(
      "Fix this → [Fix this](https://x.test/new?prompt=%20inline%20(%60env.X%20%3F%20mintWsToken(...)%20%3A%20%22%22%60)&repo=o/s) done"
    );
    // One clean link token: no paren survives inside the destination, so
    // the naive parser can't cut the URL short and spill the tail.
    expect(out).toBe(
      "Fix this → [Fix this](https://x.test/new?prompt=%20inline%20%28%60env.X%20%3F%20mintWsToken%28...%29%20%3A%20%22%22%60%29&repo=o/s) done"
    );
  });

  it("leaves unbalanced pseudo-links alone instead of eating the body", () => {
    const input = "broken [link](https://x.test/never-closes and more text";
    expect(normalizeForgeMarkdown(input)).toBe(input);
  });

  it("strips CRLF so $-anchored headers/rules still parse", () => {
    // GitHub returns bodies with CRLF; a trailing \r breaks the SDK
    // header regex's $ anchor, rendering "## Summary" as literal text.
    const out = normalizeForgeMarkdown(
      "#### [optional]\r\n## Summary\r\n\r\nBody line\r\n"
    );
    expect(out).not.toContain("\r");
    expect(out).toBe("#### [optional]\n## Summary\n\nBody line");
  });

  it("leaves ordinary markdown untouched", () => {
    const plain =
      "# Title\n\nSome **bold** text with `code` and a [link](https://x.test).\n\n- one\n- two";
    expect(normalizeForgeMarkdown(plain)).toBe(plain);
  });
});
