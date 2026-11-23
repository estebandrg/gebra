// Pasted/copied math text: the LaTeX delimiters people wrap formulas in.

/**
 * `$$x$$`, `$x$`, `\[x\]` or `\(x\)` → `x`. Only one wrapping pair counts: `$a$ y $b$` is prose with two
 * formulas, not one formula, so it (like any text without delimiters) comes back trimmed.
 */
export function unwrapMath(text: string): string {
  const t = text.trim();
  const dollars = t.match(/^\$\$([^$]+)\$\$$/) ?? t.match(/^\$([^$]+)\$$/);
  const other = t.match(/^\\\[([\s\S]+)\\\]$/) ?? t.match(/^\\\(([\s\S]+)\\\)$/);
  return (dollars ?? other)?.[1]!.trim() || t;
}

/** True when `unwrapMath` would strip a delimiter pair, i.e. the text is a single wrapped formula. */
export const isWrappedMath = (text: string) => unwrapMath(text) !== text.trim();

/** LaTeX as people paste it elsewhere: between single dollars. */
export const wrapMath = (latex: string) => `$${latex.trim()}$`;

export interface MathSpan {
  start: number;
  /** Index just after the closing delimiter (or the end of the text while the formula is still open). */
  end: number;
  /** Delimiter length: 1 for `$`, 2 for `$$`. */
  delim: 1 | 2;
  latex: string;
  /** False while the closing `$` has not been typed yet. */
  closed: boolean;
}

/** Every `$…$` / `$$…$$` in the text, in order; a last unmatched opening `$` is an open span (formula being typed). */
export function mathSpans(text: string): MathSpan[] {
  const out: MathSpan[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] !== "$") {
      i++;
      continue;
    }
    const delim = text.startsWith("$$", i) ? 2 : 1;
    const close = text.indexOf("$".repeat(delim), i + delim);
    if (close === -1) {
      out.push({ start: i, end: text.length, delim, latex: text.slice(i + delim), closed: false });
      break;
    }
    out.push({ start: i, end: close + delim, delim, latex: text.slice(i + delim, close), closed: true });
    i = close + delim;
  }
  return out;
}

/** The formula the caret is in or touching (including one still being typed), if any. */
export const mathAt = (text: string, caret: number) => mathSpans(text).find((s) => s.start <= caret && caret <= s.end && s.latex.trim()) ?? null;
