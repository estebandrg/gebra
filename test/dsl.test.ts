import { describe, expect, test } from "bun:test";
import { validatePresentation } from "../src/shared/dsl";

const ok = {
  title: "Resolver 2x+3=7",
  steps: [
    { say: "Miremos la ecuación", actions: [{ type: "highlight", target: "m1" }] },
    {
      say: "Restamos $3$ en ambos lados",
      actions: [
        { type: "write", id: "s1", latex: "2x\\htmlId{menos}{-3}+3=7-3", below: "m1", color: "yellow" },
        { type: "arrow", from: "m1", to: "s1", label: "$-3$" },
        { type: "strike", target: "s1#menos" },
      ],
    },
    { say: "Graficamos", actions: [{ type: "plot", id: "g", exprs: ["2x-4"], xRange: [-1, 4], right: "m1" }] },
  ],
};

describe("validatePresentation", () => {
  test("accepts a well formed presentation referencing board ids", () => {
    expect(validatePresentation(ok, ["m1"])).toEqual([]);
  });

  test("rejects unknown targets, duplicate ids, bad colors and unknown types", () => {
    const bad = {
      title: "x",
      steps: [
        {
          say: "a",
          actions: [
            { type: "write", id: "s1", latex: "x", at: { x: 0, y: 0 } },
            { type: "write", id: "s1", latex: "y", below: "s1" },
            { type: "highlight", target: "nope" },
            { type: "strike", target: "s1", color: "purple" },
            { type: "dance" },
          ],
        },
      ],
    };
    const errors = validatePresentation(bad, []);
    expect(errors).toContain('steps[0].actions[1]: id duplicado "s1"');
    expect(errors).toContain('steps[0].actions[2]: target desconocido "nope"');
    expect(errors).toContain('steps[0].actions[3]: color inválido "purple"');
    expect(errors).toContain('steps[0].actions[4]: tipo de acción desconocido "dance"');
  });

  test("reports LaTeX that KaTeX cannot render", () => {
    const errors = validatePresentation(
      { title: "t", steps: [{ say: "ojo $\\frac{1$", actions: [{ type: "write", id: "a", latex: "\\frac{1}{", at: { x: 0, y: 0 } }] }] },
      [],
    );
    expect(errors.some((e) => e.startsWith("steps[0].say: LaTeX inválido"))).toBe(true);
    expect(errors.some((e) => e.startsWith("steps[0].actions[0]: LaTeX inválido"))).toBe(true);
  });

  test("requires title and at least one step", () => {
    expect(validatePresentation({ steps: [] }, [])).toEqual(["title es obligatorio", "steps debe tener al menos un paso"]);
  });

  test("write needs a placement or follows the previous written item", () => {
    const errors = validatePresentation({ title: "t", steps: [{ say: "a", actions: [{ type: "write", id: "a", latex: "x" }] }] }, []);
    expect(errors).toEqual([]);
  });
});
