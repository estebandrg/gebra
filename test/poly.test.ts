import { describe, expect, test } from "bun:test";
import { formatNumber, parseNumber, polyCoeffs } from "../src/shared/poly";

describe("polyCoeffs", () => {
  test("descending and complete, with zeros for missing terms", () => {
    expect(polyCoeffs("x^3-7x+6")).toEqual([1, 0, -7, 6]);
    expect(polyCoeffs("2x^2-3")).toEqual([2, 0, -3]);
    expect(polyCoeffs("4x^{2}-13x+3")).toEqual([4, -13, 3]);
  });
  test("expands products first", () => {
    expect(polyCoeffs("(x-2)(x+3)")).toEqual([1, 1, -6]);
  });
  test("an equation becomes lhs − rhs", () => {
    expect(polyCoeffs("2x^2-3=x")).toEqual([2, -1, -3]);
  });
});

describe("parseNumber / formatNumber", () => {
  test("integers, decimals, fractions and LaTeX fractions", () => {
    expect(parseNumber("-3")).toBe(-3);
    expect(parseNumber(" 2.5 ")).toBe(2.5);
    expect(parseNumber("-3/2")).toBe(-1.5);
    expect(parseNumber("\\frac{1}{4}")).toBe(0.25);
    expect(parseNumber("-\\frac{3}{2}")).toBe(-1.5);
    expect(parseNumber("−4")).toBe(-4);
  });
  test("garbage is null", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("x")).toBeNull();
    expect(parseNumber("1/0")).toBeNull();
  });
  test("formats integers and simple fractions", () => {
    expect(formatNumber(-3)).toBe("-3");
    expect(formatNumber(-1.5)).toBe("-3/2");
    expect(formatNumber(1 / 3)).toBe("1/3");
  });
});
