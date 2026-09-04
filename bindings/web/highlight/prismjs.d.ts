/**
 * Minimal typings for the slice of Prism this plugin uses (tokenize only).
 * Prism ships no types of its own and @types/prismjs is not worth a
 * dependency for two functions.
 */
declare module "prismjs" {
  export type TokenStream = string | Token | Array<string | Token>;
  export class Token {
    type: string;
    content: TokenStream;
    alias: string | string[];
    length: number;
  }
  export interface Grammar {
    [key: string]: unknown;
  }
  const Prism: {
    languages: Record<string, Grammar | undefined>;
    tokenize(text: string, grammar: Grammar): Array<string | Token>;
  };
  export default Prism;
}

declare module "prismjs/components/*" {
  const nothing: undefined;
  export default nothing;
}
