import { describe, expect, test } from "bun:test";
import { isWrappedMath, mathAt, mathSpans, unwrapMath, wrapMath } from "../src/shared/latex";

describe("unwrapMath", () => {
  test("strips $$…$$, $…$, \\[…\\] and \\(…\\)", () => {
    expect(unwrapMath("$$2x+3=7$$")).toBe("2x+3=7");
    expect(unwrapMath("  $x^2-4$ \n")).toBe("x^2-4");
    expect(unwrapMath("\\[\\frac{a}{b}\\]")).toBe("\\frac{a}{b}");
    expect(unwrapMath("\\(x=1\\)")).toBe("x=1");
  });

  test("text without delimiters, empty delimiters and prose with several formulas are left alone", () => {
    expect(unwrapMath("2x+3=7")).toBe("2x+3=7");
    expect(unwrapMath("$$")).toBe("$$");
    expect(unwrapMath("$a$ y $b$")).toBe("$a$ y $b$");
  });

  test("isWrappedMath tells a wrapped formula from plain text", () => {
    expect(isWrappedMath("$$x$$")).toBe(true);
    expect(isWrappedMath("x")).toBe(false);
  });
});

describe("wrapMath", () => {
  test("puts the LaTeX between single dollars", () => {
    expect(wrapMath("2x+3=7")).toBe("$2x+3=7$");
    expect(wrapMath("  x^2 ")).toBe("$x^2$");
  });
});

describe("mathSpans / mathAt (the composer's live formula)", () => {
  test("finds closed formulas with their positions", () => {
    expect(mathSpans("a $x$ b $$y$$")).toEqual([
      { start: 2, end: 5, delim: 1, latex: "x", closed: true },
      { start: 8, end: 13, delim: 2, latex: "y", closed: true },
    ]);
  });

  test("a formula still being typed is an open span up to the end", () => {
    expect(mathSpans("mirá $x^2+")).toEqual([{ start: 5, end: 10, delim: 1, latex: "x^2+", closed: false }]);
  });

  test("mathAt follows the caret: inside or touching a formula, nothing in plain text", () => {
    const t = "ab $x$ cd";
    expect(mathAt(t, 4)?.latex).toBe("x");
    expect(mathAt(t, 3)?.latex).toBe("x"); // right before the opening $
    expect(mathAt(t, 6)?.latex).toBe("x"); // right after the closing $
    expect(mathAt(t, 1)).toBeNull();
    expect(mathAt(t, 8)).toBeNull();
    expect(mathAt("$ $", 1)).toBeNull(); // blank formula: nothing to draw
  });
});

import { deleteRange } from "../src/shared/textedit";

describe("deleteRange (chat box deletions)", () => {
  test("one character either way, a surrogate pair counts as one", () => {
    expect(deleteRange("abc", 2, "deleteContentBackward")).toEqual([1, 2]);
    expect(deleteRange("abc", 1, "deleteContentForward")).toEqual([1, 2]);
    expect(deleteRange("a😀", 3, "deleteContentBackward")).toEqual([1, 3]);
    expect(deleteRange("abc", 0, "deleteContentBackward")).toEqual([0, 0]);
  });

  test("a word, and a line", () => {
    expect(deleteRange("hola mundo ", 11, "deleteWordBackward")).toEqual([5, 11]);
    expect(deleteRange("hola mundo", 4, "deleteWordForward")).toEqual([4, 10]);
    expect(deleteRange("uno\ndos tres", 8, "deleteSoftLineBackward")).toEqual([4, 8]);
    expect(deleteRange("uno\ndos", 1, "deleteSoftLineForward")).toEqual([1, 3]);
  });
});
