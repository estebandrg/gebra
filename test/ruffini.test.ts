import { describe, expect, test } from "bun:test";
import { applyCell, cellOrder, expectedTable, nextCell, parseDivision, rufFactorLatex, rufResult, startRuffini, summarize } from "../src/shared/tools/ruffini";

describe("parseDivision", () => {
  test("reads dividend coefficients and the root of x − a", () => {
    expect(parseDivision("\\left(4x^{2}-13x+3\\right)\\div\\left(x-3\\right)")).toEqual({ dividend: "4x^{2}-13x+3", coeffs: [4, -13, 3], root: 3 });
  });
  test("negative roots and missing terms", () => {
    expect(parseDivision("\\left(x^{3}-7x+6\\right)\\div\\left(x+2\\right)")).toMatchObject({ coeffs: [1, 0, -7, 6], root: -2 });
  });
  test("non-monic divisors are rejected", () => {
    expect(parseDivision("\\left(x^2-1\\right)\\div\\left(2x-1\\right)")).toBeNull();
  });
});

describe("table", () => {
  test("expected table and cell order", () => {
    expect(expectedTable([1, 0, -7, 6], -2)).toEqual({ c: [1, 0, -7, 6], p: [null, -2, 4, 6], s: [1, -2, -3, 12] });
    expect(cellOrder(2)).toEqual(["c0", "c1", "c2", "r", "s0", "p1", "s1", "p2", "s2"]);
  });
});

describe("guided filling", () => {
  const start = () => startRuffini("x^{3}-7x+6", [1, 0, -7, 6], -2);
  const fill = (values: [string, string][]) => values.reduce((d, [cell, v]) => applyCell(d, cell, v).data, start());

  test("each correct cell locks and the next one is marked", () => {
    let d = start();
    expect(nextCell(d)).toBe("c0");
    const r = applyCell(d, "c0", "1");
    expect(r.ok).toBe(true);
    d = r.data;
    expect(d.entries).toEqual({ c0: 1 });
    expect(nextCell(d)).toBe("c1");
  });

  test("a missing term gets the zero hint and nothing is stored", () => {
    const d = fill([["c0", "1"]]);
    const r = applyCell(d, "c1", "-7");
    expect(r.ok).toBe(false);
    expect(r.hint).toBe("Falta el término de x²: completá con 0.");
    expect(r.data.entries).toEqual({ c0: 1 });
    expect(r.data.wrong).toEqual({ cell: "c1", value: "-7", hint: "Falta el término de x²: completá con 0." });
  });

  test("the root sign hint", () => {
    const d = fill([["c0", "1"], ["c1", "0"], ["c2", "-7"], ["c3", "6"]]);
    expect(applyCell(d, "r", "2").hint).toBe("La raíz es el número que anula el divisor: en (x+2) va −2.");
  });

  test("product and sum hints", () => {
    const d = fill([["c0", "1"], ["c1", "0"], ["c2", "-7"], ["c3", "6"], ["r", "-2"], ["s0", "1"]]);
    expect(applyCell(d, "p1", "-1").hint).toBe("Es un producto, no una suma: multiplicá 1 · (−2).");
    expect(applyCell(d, "p1", "1").hint).toBe("Multiplicá por la raíz: 1 · (−2).");
    const d2 = applyCell(d, "p1", "-2").data;
    expect(applyCell(d2, "s1", "2").hint).toBe("Se suma la columna: 0 + (−2).");
  });

  test("only the next cell can be filled", () => {
    expect(applyCell(start(), "s0", "1")).toMatchObject({ ok: false, hint: "Primero completá la celda marcada." });
  });

  test("completion builds quotient and remainder and the summary", () => {
    const d = fill([["c0", "1"], ["c1", "0"], ["c2", "-7"], ["c3", "6"], ["r", "-2"], ["s0", "1"], ["p1", "-2"], ["s1", "-2"], ["p2", "4"], ["s2", "-3"], ["p3", "6"], ["s3", "12"]]);
    expect(nextCell(d)).toBeNull();
    expect(rufResult(d)).toEqual({ quotient: "x^{2}-2x-3", remainder: "12", latex: "C=x^{2}-2x-3,\\ R=12" });
    expect(summarize(d as never)).toBe("x^{3}-7x+6 ÷ (x+2): completo · C=x^{2}-2x-3, R=12");
  });

  test("summary while filling, and a free root accepts any number", () => {
    const d = fill([["c0", "1"]]);
    expect(summarize(d as never)).toBe("x^{3}-7x+6 ÷ (x+2): 1/12 celdas · sigue c1 (coeficiente de x²)");
    const free = startRuffini("x^2-1", [1, 0, -1]);
    const f = ["1", "0", "-1"].reduce((acc, v, i) => applyCell(acc, `c${i}`, v).data, free);
    const r = applyCell(f, "r", "1");
    expect(r.ok).toBe(true);
    expect(r.data.root).toBe(1);
    expect(summarize(free as never)).toBe("x^2-1 ÷ (x−?): 0/9 celdas · sigue c0 (coeficiente de x²)");
  });
});

describe("factored form for factor/solve cards", () => {
  const done = (prefix?: string) => {
    let d = startRuffini("x^3-7x+6", [1, 0, -7, 6], 2);
    if (prefix) d = { ...d, prefix };
    for (const [c, v] of [["c0", "1"], ["c1", "0"], ["c2", "-7"], ["c3", "6"], ["r", "2"], ["s0", "1"], ["p1", "2"], ["s1", "2"], ["p2", "4"], ["s2", "-3"], ["p3", "-6"], ["s3", "0"]] as const)
      d = applyCell(d, c, v).data;
    return d;
  };
  test("remainder 0 gives (x − r)·C, with an optional prefix", () => {
    expect(rufFactorLatex(done())).toBe("\\left(x-2\\right)\\left(x^{2}+2x-3\\right)");
    expect(rufFactorLatex(done("x"))).toBe("x\\left(x-2\\right)\\left(x^{2}+2x-3\\right)");
  });
  test("a non-zero remainder or an unfinished table has no factored form", () => {
    expect(rufFactorLatex(startRuffini("x^2+1", [1, 0, 1], 1))).toBeNull();
  });
});
