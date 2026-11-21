import { describe, expect, test } from "bun:test";
import katex from "katex";
import { compareSteps } from "../src/shared/cas";
import { THEORY, searchTheory } from "../src/shared/theory";

const TOPICS = ["lineal", "cuadratica", "factorizar", "operaciones", "division"];
const entries = THEORY.flatMap((s) => s.entries.map((e) => ({ ...e, section: s })));

describe("theory content", () => {
  test("covers the requested sections", () => {
    expect(THEORY.map((s) => s.title)).toEqual(["Ecuaciones lineales", "Cuadráticas", "Productos notables", "Casos de factoreo", "División de polinomios"]);
  });

  test("every entry is complete, with a valid topic and a unique id", () => {
    for (const e of entries) {
      expect(e.title.length).toBeGreaterThan(2);
      expect(e.text.length).toBeGreaterThan(10);
      expect(e.latex.length).toBeGreaterThan(2);
      expect(TOPICS).toContain(e.section.topic);
    }
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
  });

  test("every formula and example renders with KaTeX", () => {
    for (const e of entries)
      for (const tex of [e.latex, e.example].filter(Boolean) as string[])
        expect(() => katex.renderToString(tex, { throwOnError: true, strict: "ignore" }), `${e.id}: ${tex}`).not.toThrow();
  });

  test("every concrete identity is verified by the CAS", () => {
    const checked = entries.filter((e) => e.check);
    expect(checked.length).toBeGreaterThanOrEqual(10);
    for (const e of checked) expect(compareSteps(e.check![0], e.check![1]).status, e.id).toBe("equivalent");
  });

  test("search matches titles and text, accent-insensitive", () => {
    expect(searchTheory("resolvente").map((e) => e.id)).toContain("resolvente");
    expect(searchTheory("diferencia de cuadrados").length).toBeGreaterThanOrEqual(2);
    expect(searchTheory("dIscriminante").map((e) => e.id)).toContain("discriminante");
    expect(searchTheory("factorizacion").length).toBeGreaterThan(0);
    expect(searchTheory("zzzz")).toEqual([]);
  });
});
