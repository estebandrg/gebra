import { describe, expect, test } from "bun:test";
import {
  parseMath, compareSteps, solveEquation, factor, expand, divide, realRoots, compile, toTeX, checkAnswer, simplify,
} from "../src/shared/cas";

describe("parseMath", () => {
  test("expression with implicit multiplication", () => {
    const m = parseMath("x^{2}+3x-4");
    expect(m.kind).toBe("expression");
    if (m.kind === "expression") expect(m.vars).toEqual(["x"]);
  });
  test("equation splits on =", () => {
    const m = parseMath("2x+3=7");
    expect(m.kind).toBe("equation");
  });
  test("\\times and \\div are normalized", () => {
    const m = parseMath("3\\times4\\div2");
    expect(m.kind).toBe("expression");
    if (m.kind === "expression") expect(m.expr).not.toContain("times");
  });
  test("solution list x=2 o x=3", () => {
    for (const s of ["x=2\\text{ o }x=3", "x=2,\\ x=3", "x=2\\lor x=3", "x_1=2,x_2=3"]) {
      const m = parseMath(s);
      expect(m.kind).toBe("solutions");
      if (m.kind === "solutions") expect(m.values.sort()).toEqual(["2", "3"]);
    }
  });
  test("empty and garbage are invalid", () => {
    expect(parseMath("").kind).toBe("empty");
    expect(parseMath("2x+=").kind).toBe("invalid");
  });
});

describe("compareSteps", () => {
  test("equivalent linear steps", () => {
    expect(compareSteps("2x+3=7", "2x=4").status).toBe("equivalent");
    expect(compareSteps("2x=4", "x=2").status).toBe("equivalent");
  });
  test("wrong step is different", () => {
    const r = compareSteps("2x+3=7", "2x=10");
    expect(r.status).toBe("different");
  });
  test("quadratic to factored and to solution list", () => {
    expect(compareSteps("x^2-5x+6=0", "(x-2)(x-3)=0").status).toBe("equivalent");
    expect(compareSteps("(x-2)(x-3)=0", "x=2\\text{ o }x=3").status).toBe("equivalent");
  });
  test("losing a root is different", () => {
    expect(compareSteps("x^2=4", "x=2").status).toBe("different");
  });
  test("expression rewriting", () => {
    expect(compareSteps("(x+1)^2", "x^2+2x+1").status).toBe("equivalent");
    expect(compareSteps("(x+1)^2", "x^2+1").status).toBe("different");
  });
  test("multivariable equations by proportionality", () => {
    expect(compareSteps("2x+4y=6", "x+2y=3").status).toBe("equivalent");
    expect(compareSteps("2x+4y=6", "x+2y=4").status).toBe("different");
  });
  test("mixing expression and equation is unknown", () => {
    expect(compareSteps("x^2-1", "x=1").status).toBe("unknown");
  });
});

describe("algebra tools", () => {
  test("solve", () => {
    expect(solveEquation("x^2-5x+6=0").solutions.sort()).toEqual(["2", "3"]);
    expect(solveEquation("x+1=x+2").solutions).toEqual([]);
    expect(solveEquation("x+1=x+1").all).toBe(true);
  });
  test("factor / expand / divide", () => {
    expect(compareSteps(factor("x^2-5x+6"), "(x-2)(x-3)").status).toBe("equivalent");
    expect(factor("x^2-5x+6")).toContain("(");
    expect(compareSteps(expand("(x+1)^3"), "x^3+3x^2+3x+1").status).toBe("equivalent");
    const d = divide("2x^3-3x^2+4", "x-2");
    expect(compareSteps(d.quotient, "2x^2+x+2").status).toBe("equivalent");
    expect(d.remainder).toBe("8");
  });
  test("realRoots ignores complex", () => {
    expect(realRoots("x^2+1")).toEqual([]);
    expect(realRoots("x^2-5x+6")).toEqual([2, 3]);
  });
  test("compile evaluates a single-variable expression", () => {
    expect(compile("x^2-1")(3)).toBe(8);
  });
  test("toTeX", () => {
    expect(toTeX("(x+1)^2/3")).toContain("\\frac");
  });
  test("checkAnswer against expected values", () => {
    expect(checkAnswer("x=3", ["3"])).toBe(true);
    expect(checkAnswer("x=\\frac{6}{2}", ["3"])).toBe(true);
    expect(checkAnswer("x=2\\text{ o }x=3", ["3", "2"])).toBe(true);
    expect(checkAnswer("x=2", ["3", "2"])).toBe(false);
    expect(checkAnswer("2x=6", ["3"])).toBe(false);
  });
});

describe("adjacent letters are a product", () => {
  test("35xb parses as 35·x·b, two variables", () => {
    const m = parseMath("35xb-7x");
    expect(m.kind).toBe("expression");
    if (m.kind === "expression") expect(m.vars).toEqual(["b", "x"]);
  });
  test("factorizations with several letters compare as equivalent", () => {
    expect(compareSteps("35xb-7x", "7x(5b-1)").status).toBe("equivalent");
    expect(compareSteps("2wx-4yw+6wxz", "2w(x-2y+3xz)").status).toBe("equivalent");
    expect(compareSteps("35xb-7x", "7x(5b+1)").status).toBe("different");
  });
  test("function names and \\frac are left alone", () => {
    expect(compareSteps("\\sin x", "\\sin x").status).not.toBe("different");
    expect(compareSteps("\\frac{x+1}{2}", "\\frac{1}{2}x+\\frac{1}{2}").status).toBe("equivalent");
    expect(compareSteps("\\sqrt{x}\\cdot\\sqrt{x}", "x").status).toBe("equivalent");
  });
});

describe("a number right after a letter is a product", () => {
  test("x5 is x·5, not a variable called x5", () => {
    const m = parseMath("3x^2-x5+6x-10");
    expect(m.kind).toBe("expression");
    if (m.kind === "expression") expect(m.vars).toEqual(["x"]);
    expect(compareSteps("3x^2-x5+6x-10", "3x^2+x-10").status).toBe("equivalent");
    expect(compareSteps("x5", "5x").status).toBe("equivalent");
    expect(compareSteps("xy5", "5xy").status).toBe("equivalent");
  });
  test("subscripts, powers, commands and decimals are left alone", () => {
    expect(parseMath("x_1=2,x_2=3").kind).toBe("solutions");
    expect(compareSteps("x^2", "x\\cdot x").status).toBe("equivalent");
    expect(compareSteps("0.5x", "x/2").status).toBe("equivalent");
    expect(compareSteps("2x^{10}", "2\\cdot x^{10}").status).toBe("equivalent");
  });
});

describe("division by a fraction", () => {
  test("a \\div \\frac{b}{c} divides by the whole fraction", () => {
    expect(simplify("2x\\div\\frac{x}{4}")).toBe("8");
    expect(simplify("\\frac{y}{2x}\\div\\frac{-1}{6x}")).toBe("-3y");
    expect(simplify("\\left(-\\frac{10}{3x}\\right)\\div\\frac{2}{x}")).toBe("-\\frac{5}{3}");
    expect(simplify("a/\\frac{\\frac{1}{2}}{3}")).toBe("6a");
  });
  test("plain division and parenthesised divisors are unchanged", () => {
    expect(simplify("12\\div4\\div3")).toBe("1");
    expect(simplify("\\frac{2}{3}\\div\\left(-\\frac{5}{4}\\right)")).toBe("-\\frac{8}{15}");
  });
});
