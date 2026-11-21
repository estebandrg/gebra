import { describe, expect, test } from "bun:test";
import { richTokens } from "../src/web/rich";

describe("richTokens", () => {
  test("bold spanning math keeps the math bold", () => {
    expect(richTokens("Buscamos **sumen $-5$** y")).toEqual([
      { kind: "text", value: "Buscamos ", bold: false },
      { kind: "text", value: "sumen ", bold: true },
      { kind: "math", value: "-5", bold: true },
      { kind: "text", value: " y", bold: false },
    ]);
  });

  test("plain bold and plain math still work", () => {
    expect(richTokens("**hola** $x^2$")).toEqual([
      { kind: "text", value: "hola", bold: true },
      { kind: "text", value: " ", bold: false },
      { kind: "math", value: "x^2", bold: false },
    ]);
  });

  test("an unmatched ** stays literal", () => {
    expect(richTokens("a ** b")).toEqual([{ kind: "text", value: "a ** b", bold: false }]);
  });
});
