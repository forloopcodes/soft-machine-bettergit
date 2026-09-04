/**
 * One highlighted source line. Prism tokens become spans colored from the
 * theme's ANSI palette, so highlighting follows every theme instead of
 * shipping its own colors. Unknown languages render the text as-is.
 */

import { Fragment, useMemo, type ReactNode } from "react";
import styled from "styled-components";
import { t } from "@soft-machine/sdk";
import { tokenizeLine, type Token, type TokenList } from "./prism";

/** Token type → theme color. Unlisted types inherit the line color. */
function colorFor(type: string): string | null {
  switch (type) {
    case "comment":
    case "prolog":
    case "doctype":
    case "cdata":
      return t.text.muted;
    case "keyword":
    case "atrule":
    case "important":
    case "rule":
      return t.ansi.magenta;
    case "string":
    case "char":
    case "attr-value":
    case "template-string":
    case "regex":
    case "inserted":
    case "url":
    case "code-snippet":
    case "code":
      return t.ansi.green;
    case "list":
    case "hr":
    case "blockquote":
      return t.text.secondary;
    case "number":
    case "boolean":
    case "constant":
    case "symbol":
    case "unit":
    case "hexcode":
      return t.ansi.yellow;
    case "function":
    case "function-name":
    case "class-name":
    case "builtin":
    case "title":
      return t.ansi.blue;
    case "tag":
    case "selector":
    case "property":
    case "attr-name":
    case "variable":
    case "key":
    case "namespace":
      return t.ansi.cyan;
    case "deleted":
      return t.ansi.red;
    case "operator":
    case "punctuation":
    case "entity":
      return t.text.secondary;
    default:
      return null;
  }
}

const Tok = styled.span<{ $color: string | null; $italic?: boolean; $bold?: boolean }>`
  color: ${({ $color }) => $color ?? "inherit"};
  font-style: ${({ $italic }) => ($italic ? "italic" : "inherit")};
  font-weight: ${({ $bold }) => ($bold ? 600 : "inherit")};
`;

function renderToken(token: string | Token, key: number): ReactNode {
  if (typeof token === "string") return <Fragment key={key}>{token}</Fragment>;
  const content = token.content;
  const inner: ReactNode = Array.isArray(content)
    ? content.map((child, i) => renderToken(child as string | Token, i))
    : typeof content === "string"
      ? content
      : renderToken(content as Token, 0);
  const aliases = Array.isArray(token.alias) ? token.alias : token.alias ? [token.alias] : [];
  const color = colorFor(token.type) ?? aliases.map(colorFor).find((c) => c !== null) ?? null;
  return (
    <Tok
      key={key}
      $color={color}
      $italic={token.type === "comment" || token.type === "italic"}
      $bold={token.type === "bold" || token.type === "title"}
    >
      {inner}
    </Tok>
  );
}

export function CodeLine({ text, language }: { text: string; language: string | null }) {
  const tokens: TokenList | null = useMemo(() => tokenizeLine(text, language), [text, language]);
  if (!tokens) return <>{text}</>;
  return <>{tokens.map((token, i) => renderToken(token, i))}</>;
}
