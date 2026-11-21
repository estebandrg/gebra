import { describe, expect, test } from "bun:test";
import { divisors, evalPoly, gaussCandidates, startGauss, summarize, tryCandidate } from "../src/shared/tools/gauss";

describe("gaussCandidates", () => {
  test("divisors of the independent term over divisors of the leading coefficient, signed and sorted", () => {
    expect(divisors(6)).toEqual([1, 2, 3, 6]);
    expect(gaussCandidates([1, 0, -7, 6])).toEqual({ factorX: 0, reduced: [1, 0, -7, 6], p: [1, 2, 3, 6], q: [1], candidates: [-6, -3, -2, -1, 1, 2, 3, 6] });
  });
  test("fractions are deduplicated", () => {
    expect(gaussCandidates([2, -1, -2, 1])!.candidates).toEqual([-1, -0.5, 0.5, 1]);
  });
  test("a zero independent term factors x out first", () => {
    expect(gaussCandidates([1, -1, -2, 0])).toMatchObject({ factorX: 1, reduced: [1, -1, -2], p: [1, 2], q: [1] });
  });
  test("non-integer coefficients have no Gauss candidates", () => {
    expect(gaussCandidates([1, 0.5, 1])).toBeNull();
  });
});

describe("trying candidates", () => {
  test("evaluates P(r) exactly enough, also for fractions", () => {
    expect(evalPoly([1, 0, -7, 6], 2)).toBe(0);
    expect(evalPoly([1, 0, -7, 6], -1)).toBe(12);
    expect(evalPoly([2, -1, -2, 1], 0.5)).toBe(0);
  });
  test("a try is stored and the summary lists roots", () => {
    let d = startGauss("x^3-7x+6", [1, 0, -7, 6]);
    expect(summarize(d as never)).toBe("P(x)=x^3-7x+6 · candidatos: -6, -3, -2, -1, 1, 2, 3, 6 · sin probar");
    d = tryCandidate(d, -1);
    d = tryCandidate(d, 2);
    expect(d.tried).toEqual({ "-1": 12, "2": 0 });
    expect(summarize(d as never)).toBe("P(x)=x^3-7x+6 · candidatos: -6, -3, -2, -1, 1, 2, 3, 6 · probados: P(-1)=12, P(2)=0 · raíces: 2");
  });
  test("malformed data does not crash the summary", () => {
    expect(summarize({})).toBe("(sin datos)");
  });
});
