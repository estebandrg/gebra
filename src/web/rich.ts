// Tokenizes chat/caption text: `$...$` is math, `**...**` is bold and may wrap math.
export type RichToken = { kind: "text" | "math"; value: string; bold: boolean };

export function richTokens(text: string): RichToken[] {
  // `$$x$$` (pasted display math) reads as `$x$`.
  const parts = text.replace(/\$\$([^$]+)\$\$/g, "$$$1$").split(/(\$[^$]+\$)/g);
  const isMath = (p: string) => p.length > 2 && p.startsWith("$") && p.endsWith("$");
  // Only paired markers toggle bold; a trailing unmatched `**` stays literal.
  const markers = parts.reduce((n, p) => (isMath(p) ? n : n + (p.split("**").length - 1)), 0);
  let usable = markers - (markers % 2);
  let bold = false;
  const out: RichToken[] = [];
  const push = (kind: RichToken["kind"], value: string) => {
    if (!value) return;
    const last = out[out.length - 1];
    if (kind === "text" && last?.kind === "text" && last.bold === bold) last.value += value;
    else out.push({ kind, value, bold });
  };
  for (const part of parts) {
    if (isMath(part)) {
      push("math", part.slice(1, -1));
      continue;
    }
    const segs = part.split("**");
    segs.forEach((seg, i) => {
      if (i > 0) {
        if (usable > 0) {
          usable--;
          bold = !bold;
        } else push("text", "**");
      }
      push("text", seg);
    });
  }
  return out;
}
