import { describe, expect, test } from "bun:test";
import katex from "katex";
import { buildFragmentModel, describeFragment, markParts, selectParts, type FragmentModel } from "../src/shared/fragments";

const SRC = String.raw`5-\frac{x+4}{0.5}=2x^2-3`;
const model = (s = SRC): FragmentModel => buildFragmentModel(s)!;
/** Selects the atoms whose source text lies inside [from, to) of the original equation. */
const sel = (m: FragmentModel, from: number, to: number) => new Set(m.ranges.flatMap(([s, e], i) => (s >= from && e <= to ? [i] : [])));
const at = (s: string, sub: string, nth = 0) => {
  let i = -1;
  for (let k = 0; k <= nth; k++) i = s.indexOf(sub, i + 1);
  return [i, i + sub.length] as const;
};

describe("buildFragmentModel", () => {
  test("every atom becomes selectable and the wrapped equation renders to the same text", () => {
    const m = model();
    expect(m.leaves).toBe(14);
    expect((m.wrapped.match(/\\htmlData\{f=\d+\}/g) ?? []).length).toBe(14);
    const html = katex.renderToString(m.wrapped, { trust: true, strict: "ignore", throwOnError: true });
    expect((html.match(/data-f="\d+"/g) ?? []).length).toBe(14);
    const text = (h: string) => h.replace(/<span class="katex-mathml">.*?<\/span><span class="katex-html"/s, '<span class="katex-html"').replace(/<[^>]+>/g, "");
    expect(text(html)).toBe(text(katex.renderToString(SRC, { trust: true, strict: "ignore" })));
  });

  test("invalid latex and empty input give no model", () => {
    expect(buildFragmentModel(String.raw`\frac{x`)).toBeNull();
    expect(buildFragmentModel("")).toBeNull();
  });

  test("finds the single relation sign", () => {
    expect(model().relations.map((r) => r.sign)).toEqual(["="]);
  });
});

describe("selectParts", () => {
  test("the numerator alone comes back without braces, with its place", () => {
    const m = model();
    const parts = selectParts(m, sel(m, ...at(SRC, "x+4")));
    expect(parts.map((p) => p.latex)).toEqual(["x+4"]);
    expect(parts[0]!.where).toEqual(["numerador", "lado izquierdo de la igualdad"]);
  });

  test("numerator and denominator together are the whole fraction, balanced", () => {
    const m = model();
    const parts = selectParts(m, new Set([...sel(m, ...at(SRC, "x+4")), ...sel(m, ...at(SRC, "0.5"))]));
    expect(parts.map((p) => p.latex)).toEqual([String.raw`\frac{x+4}{0.5}`]);
  });

  test("a term and its power merge into one run: 2x^2", () => {
    const m = model();
    const parts = selectParts(m, sel(m, ...at(SRC, "2x^2")));
    expect(parts.map((p) => p.latex)).toEqual(["2x^2"]);
    expect(parts[0]!.where).toEqual(["lado derecho de la igualdad"]);
  });

  test("only the exponent is just the exponent", () => {
    const m = model();
    const parts = selectParts(m, sel(m, ...at(SRC, "2", 1)));
    expect(parts.map((p) => p.latex)).toEqual(["2"]);
    expect(parts[0]!.where).toEqual(["exponente", "lado derecho de la igualdad"]);
  });

  test("atoms in different places never produce an unbalanced slice", () => {
    const m = model();
    const parts = selectParts(m, new Set([...sel(m, ...at(SRC, "4")), ...sel(m, ...at(SRC, "0.5"))]));
    expect(parts.map((p) => p.latex)).toEqual(["4", "0.5"]);
  });

  test("a selection that crosses the equals sign says so", () => {
    const m = model(String.raw`2x+3=7`);
    const parts = selectParts(m, sel(m, 3, 6));
    expect(parts.map((p) => p.latex)).toEqual(["3=7"]);
    expect(parts[0]!.where).toEqual(["abarca la igualdad"]);
  });

  test("square roots and parentheses are whole units when fully selected", () => {
    const r = String.raw`\sqrt{x+1}+\left(a+b\right)^2=0`;
    const m = model(r);
    expect(selectParts(m, sel(m, 0, r.indexOf("=") )).map((p) => p.latex)).toEqual([String.raw`\sqrt{x+1}+\left(a+b\right)^2`]);
    expect(selectParts(m, sel(m, ...at(r, "x+1"))).map((p) => p.where[0])).toEqual(["radicando"]);
    expect(selectParts(m, sel(m, ...at(r, "a+b"))).map((p) => p.latex)).toEqual(["a+b"]);
  });

  test("bare arguments (x^2, \\frac12) can still be wrapped and selected", () => {
    const r = String.raw`\frac12+x^2`;
    const m = model(r);
    const html = katex.renderToString(m.wrapped, { trust: true, strict: "ignore", throwOnError: true });
    expect((html.match(/data-f="\d+"/g) ?? []).length).toBe(m.leaves);
    expect(selectParts(m, sel(m, ...at(r, "1"))).map((p) => [p.latex, p.where[0]])).toEqual([["1", "numerador"]]);
    expect(selectParts(m, sel(m, ...at(r, "x^2"))).map((p) => p.latex)).toEqual(["x^2"]);
  });

  test("nothing selected, nothing returned", () => {
    expect(selectParts(model(), new Set())).toEqual([]);
  });
});

describe("markParts and describeFragment", () => {
  test("the marked version shows exactly where the part sits", () => {
    const m = model();
    const parts = selectParts(m, sel(m, ...at(SRC, "x+4")));
    expect(markParts(SRC, parts)).toBe("5-\\frac{«x+4»}{0.5}=2x^2-3");
  });

  test("the report gives the complete equation, the part, its place and the CAS verdict", () => {
    const m = model();
    const parts = selectParts(m, sel(m, ...at(SRC, "x+4")));
    const text = describeFragment({ id: "m3", source: "pizarra", kind: "math", rect: { x: 0, y: 0, w: 1, h: 1 }, latex: SRC, verdict: "✓ equivalente al paso anterior" }, parts, { elements: [], notes: [] });
    expect(text).toContain("Ecuación completa: $5-\\frac{x+4}{0.5}=2x^2-3$ — ✓ equivalente al paso anterior");
    expect(text).toContain("Parte marcada: $x+4$ (numerador, lado izquierdo de la igualdad)");
    expect(text).toContain("Con la marca: 5-\\frac{«x+4»}{0.5}=2x^2-3");
    expect(text).toContain("[m3] (pizarra) ecuación");
  });

  test("on a presentation line it adds the step's explanation", () => {
    const m = model(String.raw`2x+3-3=7-3`);
    const parts = selectParts(m, sel(m, 5, 7));
    const text = describeFragment(
      { id: "paso2", source: "presentación", kind: "math", rect: { x: 0, y: 0, w: 1, h: 1 }, latex: String.raw`2x+3-3=7-3`, color: "yellow" },
      parts,
      { elements: [], notes: [{ type: "highlight", target: "paso2", style: "box", color: "pink" }], presentation: { title: "Resolver", step: 2, total: 4, caption: "Resto 3" } },
    );
    expect(text).toContain("(presentación)");
    expect(text).toContain('explicación de ese paso: "Resto 3"');
    expect(text).toContain("resaltó con caja rosa");
  });
});
