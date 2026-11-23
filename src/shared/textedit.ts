// Pure text-editing helpers for the chat box (which keeps its own text model instead of a <textarea>).

/** Range [from, to) that a `delete*` input type removes when nothing is selected and the caret is at `caret`. */
export function deleteRange(text: string, caret: number, inputType: string): [number, number] {
  const back = inputType.includes("Backward");
  if (inputType.startsWith("deleteWord")) {
    if (back) {
      const m = text.slice(0, caret).match(/\S+\s*$|\s+$/);
      return [caret - (m?.[0].length ?? 0), caret];
    }
    const m = text.slice(caret).match(/^\s*\S+|^\s+/);
    return [caret, caret + (m?.[0].length ?? 0)];
  }
  if (inputType.includes("Line")) {
    if (back) return [text.lastIndexOf("\n", caret - 1) + 1, caret];
    const nl = text.indexOf("\n", caret);
    return [caret, nl === -1 ? text.length : nl];
  }
  // One character (a surrogate pair counts as one).
  if (back) {
    const pair = caret >= 2 && /[\uDC00-\uDFFF]/.test(text[caret - 1]!) && /[\uD800-\uDBFF]/.test(text[caret - 2]!);
    return [Math.max(0, caret - (pair ? 2 : 1)), caret];
  }
  const pair = caret + 1 < text.length && /[\uD800-\uDBFF]/.test(text[caret]!) && /[\uDC00-\uDFFF]/.test(text[caret + 1]!);
  return [caret, Math.min(text.length, caret + (pair ? 2 : 1))];
}
