import { describe, expect, test } from "bun:test";
import { CATALOG, catalogExercise, catalogItems, findCatalogItem } from "../src/shared/catalog";
import { compareSteps, parseMath } from "../src/shared/cas";
import { checkExerciseStep, exerciseAnswerTeX } from "../src/shared/exercises";

describe("TP2 catalog", () => {
  test("is split into sections with groups, and ids are unique", () => {
    expect(CATALOG.map((s) => s.id)).toEqual(["ecuaciones", "notables", "factorizacion", "cuadraticas", "simplificar"]);
    for (const s of CATALOG) expect(s.groups.length).toBeGreaterThan(0);
    const ids = catalogItems().map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  test("covers the worksheet without the word problems", () => {
    const count = (num: number) => catalogItems().filter((i) => i.id.replace(/[a-z]+$/, "") === String(num)).length;
    expect([1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(count)).toEqual([10, 6, 12, 4, 5, 4, 3, 10, 5, 6, 8, 4, 3]);
    expect(count(2)).toBe(0);
  });
  test("looks items up by id", () => {
    expect(findCatalogItem("5a")?.latex).toBe("35xb-7x");
    expect(findCatalogItem("zz")).toBeUndefined();
  });

  for (const item of catalogItems())
    test(`${item.id}: statement parses and its answer is accepted`, () => {
      expect(parseMath(item.latex).kind).not.toBe("invalid");
      const ex = catalogExercise(item);
      expect(ex.answer.length).toBeGreaterThan(0);
      if (item.kind === "solve") {
        const line = ex.answer[0] === "none" ? "\\text{sin solución}" : ex.answer[0] === "all" ? "\\text{infinitas soluciones}" : null;
        if (line) expect(checkExerciseStep(ex, line).status).toBe("solved");
        else expect(checkExerciseStep(ex, ex.answer.map((v) => `x=${v}`).join(",\\ ")).status).toBe("solved");
      } else {
        expect(compareSteps(item.latex, ex.answer[0]!).status).toBe("equivalent");
        expect(checkExerciseStep(ex, ex.answer[0]!)).toEqual({ status: "solved", reason: "¡Resuelto!" });
        // the statement itself is not yet the answer
        expect(checkExerciseStep(ex, item.latex).status).toBe("progress");
      }
      expect(exerciseAnswerTeX(ex)).not.toBe("");
    });

  test("the equations with a special outcome match the worksheet hint (1c identity, 1d none, 1g identity, 1j none, 11f none)", () => {
    const answer = (id: string) => catalogExercise(findCatalogItem(id)!).answer;
    expect(answer("1c")).toEqual(["all"]);
    expect(answer("1d")).toEqual(["none"]);
    expect(answer("1g")).toEqual(["all"]);
    expect(answer("1j")).toEqual(["none"]);
    expect(answer("11f")).toEqual(["none"]);
    expect(answer("1a")).toEqual(["1"]);
  });
  test("each call builds a card exercise with a fresh id", () => {
    const item = findCatalogItem("11a")!;
    expect(catalogExercise(item).id).not.toBe(catalogExercise(item).id);
    expect(catalogExercise(item)).toMatchObject({ kind: "solve", topic: "cuadratica", latex: item.latex });
  });
});
