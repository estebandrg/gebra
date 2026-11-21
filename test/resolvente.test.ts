import { describe, expect, test } from "bun:test";
import { applyStep, nextStep, resolventeResult, startResolvente, summarize } from "../src/shared/tools/resolvente";

const fill = (eq: string, steps: [string, string][]) => steps.reduce((d, [s, v]) => applyStep(d, s, v).data, startResolvente(eq));

describe("coefficients", () => {
  test("a, b, c come from ax²+bx+c=0 after moving everything to the left", () => {
    expect(startResolvente("2x^2-3=x").coeffs).toEqual([2, -1, -3]);
    expect(startResolvente("x^2-5x+6=0").coeffs).toEqual([1, -5, 6]);
  });
  test("sign hint for b and the missing term hint", () => {
    const d = fill("2x^2-3=x", [["a", "2"]]);
    expect(applyStep(d, "b", "1").hint).toBe("Revisá el signo de b: al pasar un término al otro miembro cambia de signo.");
    expect(applyStep(startResolvente("x^2-9=0"), "a", "1").ok).toBe(true);
    expect(applyStep(fill("x^2-9=0", [["a", "1"]]), "b", "-9").hint).toBe("No hay término en x: b = 0.");
  });
  test("the −1 convention is accepted and kept consistent", () => {
    const d = fill("x^2-5x+6=0", [["a", "-1"]]);
    expect(d.sign).toBe(-1);
    expect(applyStep(d, "b", "-5").ok).toBe(false);
    expect(applyStep(d, "b", "5").ok).toBe(true);
  });
});

describe("discriminant, nature and roots", () => {
  const abc: [string, string][] = [["a", "1"], ["b", "-5"], ["c", "6"]];
  test("Δ hints", () => {
    const d = fill("x^2-5x+6=0", abc);
    expect(nextStep(d)).toBe("delta");
    expect(applyStep(d, "delta", "49").hint).toBe("Es b² − 4ac: cuidado con el signo de 4ac.");
    expect(applyStep(d, "delta", "25").hint).toBe("Te faltó restar 4·a·c.");
    expect(applyStep(d, "delta", "-49").hint).toBe("(−5)² es positivo: el cuadrado de un número negativo da positivo.");
    expect(applyStep(d, "delta", "1").ok).toBe(true);
  });
  test("nature and the two roots in any order, then the result line", () => {
    const d = fill("x^2-5x+6=0", [...abc, ["delta", "1"]]);
    expect(applyStep(d, "nature", "doble").hint).toBe("Si Δ > 0 hay dos raíces reales distintas; si Δ = 0, una doble; si Δ < 0, ninguna real.");
    const d2 = fill("x^2-5x+6=0", [...abc, ["delta", "1"], ["nature", "dos"], ["x1", "2"]]);
    expect(applyStep(d2, "x2", "2").hint).toBe("Esa ya la encontraste: la otra usa el otro signo del ±.");
    const done = applyStep(d2, "x2", "3").data;
    expect(nextStep(done)).toBeNull();
    expect(resolventeResult(done)).toBe("x=2,\\ x=3");
    expect(summarize(done as never)).toBe("x^2-5x+6=0 · a=1 b=-5 c=6 · Δ=1 · dos raíces · x₁=2 · x₂=3");
  });
  test("root hints: −b and dividing by 2a", () => {
    const d = fill("2x^2-3x-2=0", [["a", "2"], ["b", "-3"], ["c", "-2"], ["delta", "25"], ["nature", "dos"]]);
    expect(applyStep(d, "x1", "-2").hint).toBe("Arranca con −b: cambiale el signo a b.");
    expect(applyStep(d, "x1", "4").hint).toBe("Dividí por 2a = 4.");
    expect(applyStep(d, "x1", "-1/2").ok).toBe(true);
    expect(applyStep(d, "x1", "\\frac{-1}{2}").ok).toBe(true);
  });
  test("irrational roots typed with sqrt", () => {
    const d = fill("x^2-2x-1=0", [["a", "1"], ["b", "-2"], ["c", "-1"], ["delta", "8"], ["nature", "dos"]]);
    const r = applyStep(d, "x1", "(2+sqrt(8))/2");
    expect(r.ok).toBe(true);
  });
  test("Δ = 0 needs one root, Δ < 0 ends without real roots", () => {
    const dbl = fill("x^2-6x+9=0", [["a", "1"], ["b", "-6"], ["c", "9"], ["delta", "0"], ["nature", "doble"], ["x1", "3"]]);
    expect(nextStep(dbl)).toBeNull();
    expect(resolventeResult(dbl)).toBe("x=3");
    const none = fill("x^2+1=0", [["a", "1"], ["b", "0"], ["c", "1"], ["delta", "-4"], ["nature", "ninguna"]]);
    expect(nextStep(none)).toBeNull();
    expect(resolventeResult(none)).toBeNull();
    expect(summarize(none as never)).toBe("x^2+1=0 · a=1 b=0 c=1 · Δ=-4 · sin raíces reales");
  });
  test("only the next step can be answered and malformed data does not crash", () => {
    expect(applyStep(startResolvente("x^2-1=0"), "delta", "4").hint).toBe("Primero completá el casillero marcado.");
    expect(summarize({})).toBe("(sin datos)");
  });
});
