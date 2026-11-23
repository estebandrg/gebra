import { describe, expect, test } from "bun:test";
import { catalogExercise, catalogItems, findCatalogItem, worksheet } from "../src/shared/catalog";

const CATALOG = worksheet("tp2").sections;
import { compareSteps, parseMath } from "../src/shared/cas";
import { checkExerciseStep, exerciseAnswerTeX } from "../src/shared/exercises";

describe("TP2 catalog", () => {
  test("is split into sections with groups, and ids are unique", () => {
    expect(CATALOG.map((s) => s.id)).toEqual(["ecuaciones", "notables", "factorizacion", "cuadraticas", "simplificar"]);
    for (const s of CATALOG) expect(s.groups.length).toBeGreaterThan(0);
    const ids = catalogItems("tp2").map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  test("covers the worksheet without the word problems", () => {
    const count = (num: number) => catalogItems("tp2").filter((i) => i.id.replace(/[a-z]+$/, "") === String(num)).length;
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
        const p = parseMath(item.latex);
        const v = p.kind === "equation" ? (p.vars[0] ?? "x") : "x";
        if (line) expect(checkExerciseStep(ex, line).status).toBe("solved");
        else expect(checkExerciseStep(ex, ex.answer.map((a) => `${v}=${a}`).join(",\\ ")).status).toBe("solved");
      } else if (item.kind === "divide") {
        expect(checkExerciseStep(ex, `C=${ex.answer[0]},\\ R=${ex.answer[1]}`).status).toBe("solved");
        expect(checkExerciseStep(ex, `C=${ex.answer[0]},\\ R=${ex.answer[1]}+1`).status).toBe("wrong");
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

import { onBoard, searchCatalog } from "../src/shared/catalog";

describe("catalog search and board marks", () => {
  test("empty query returns everything, an id returns that item", () => {
    expect(searchCatalog("").length).toBe(catalogItems().length);
    expect(searchCatalog("5a", "tp2").map((i) => i.id)).toEqual(["5a"]);
    expect(searchCatalog("5a").map(itemKey)).toEqual(["tp1:5a", "tp2:5a", "tp3:5a"]);
  });
  test("matches group titles and statement text ignoring LaTeX noise", () => {
    expect(searchCatalog("diferencia de cuadrados").every((i) => i.id.startsWith("6"))).toBe(true);
    expect(searchCatalog("trinomio").length).toBe(4);
    expect(searchCatalog("35xb").map((i) => i.id)).toEqual(["5a"]);
    expect(searchCatalog("zzzz")).toEqual([]);
  });
  test("an item is on the board once its exercise was added", () => {
    const item = findCatalogItem("12c")!;
    expect(onBoard([], item)).toBe(false);
    expect(onBoard([catalogExercise(item)], item)).toBe(true);
    expect(onBoard([catalogExercise(findCatalogItem("12d")!)], item)).toBe(false);
  });
});

import { itemKey } from "../src/shared/catalog";

describe("worksheet keys", () => {
  test("items know their worksheet and have a unique key; exercise ids carry both", () => {
    const item = findCatalogItem("5a")!;
    expect(item.ws).toBe("tp2");
    expect(itemKey(item)).toBe("tp2:5a");
    expect(catalogExercise(item).id.startsWith("tp2-5a-")).toBe(true);
    const keys = catalogItems().map(itemKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("TP3 catalog", () => {
  const tp3 = () => catalogItems("tp3");
  const numberOf = (i: { id: string }) => Number(i.id.match(/^\d+/)![0]);
  test("has three sections and skips the conceptual exercises", () => {
    expect(worksheet("tp3").sections.map((s) => s.id)).toEqual(["operaciones", "division", "raices"]);
    const nums = [...new Set(tp3().map(numberOf))];
    expect(nums).toEqual([5, 6, 7, 8, 9, 11, 14, 15]);
    for (const skipped of [1, 2, 3, 4, 10, 12, 13]) expect(nums).not.toContain(skipped);
  });
  test("counts per exercise number", () => {
    const count = (n: number) => tp3().filter((i) => numberOf(i) === n).length;
    expect([5, 6, 7, 8, 9, 11, 14, 15].map(count)).toEqual([6, 1, 3, 8, 8, 9, 7, 5]);
  });
  test("every TP3 item is accepted by the card with its own answer", () => {
    for (const item of tp3()) {
      const ex = catalogExercise(item);
      expect(ex.id.startsWith(`tp3-${item.id}-`)).toBe(true);
      if (item.kind === "divide") expect(checkExerciseStep(ex, `C=${ex.answer[0]},\\ R=${ex.answer[1]}`).status).toBe("solved");
      else if (item.kind === "solve") expect(checkExerciseStep(ex, `k=${ex.answer[0]}`).status).toBe("solved");
      else expect(checkExerciseStep(ex, ex.answer[0]!).status).toBe("solved");
    }
  });
  test("the remainder theorem items match the Ruffini remainders and the worksheet example", () => {
    for (const id of "abcdefgh") {
      const rem = findCatalogItem(`8${id}`, "tp3")!.answer![1];
      expect(findCatalogItem(`9${id}`, "tp3")!.answer![0]).toBe(rem);
    }
    expect(findCatalogItem("8b", "tp3")!.answer).toEqual(["2x^{2}+2x+7", "13"]); // PDF: P(3) = 13 is the remainder
    expect(findCatalogItem("7a", "tp3")!.answer).toEqual(["3x+2", "9"]);
  });
  test("finding k gives the values the CAS derives and shows k in the expected answer", () => {
    const ks = "abcde".split("").map((id) => catalogExercise(findCatalogItem(`15${id}`, "tp3")!));
    expect(ks.map((e) => e.answer[0])).toEqual(["-11", "6", "-3", "5", "0"]);
    expect(exerciseAnswerTeX(ks[0]!)).toBe("k=-11");
  });
  test("roots: a root gives 0 and a non-root does not", () => {
    expect(findCatalogItem("11a1", "tp3")!.answer).toEqual(["-6"]);
    expect(findCatalogItem("11b1", "tp3")!.answer).toEqual(["0"]);
    expect(findCatalogItem("11c3", "tp3")!.answer).toEqual(["0"]);
  });
  test("an exercise is on the board only for its own worksheet", () => {
    const tp3a = findCatalogItem("5a", "tp3")!;
    expect(onBoard([catalogExercise(findCatalogItem("5a", "tp2")!)], tp3a)).toBe(false);
    expect(onBoard([catalogExercise(tp3a)], tp3a)).toBe(true);
  });
});

describe("TP1 catalog", () => {
  const tp1 = () => catalogItems("tp1");
  const numberOf = (i: { id: string }) => Number(i.id.match(/^\d+/)![0]);
  test("loads only the computational exercises, in four sections", () => {
    expect(worksheet("tp1").sections.map((s) => s.id)).toEqual(["enteros", "racionales", "expresiones", "porcentajes"]);
    expect([...new Set(tp1().map(numberOf))]).toEqual([4, 5, 11, 12, 13, 14, 15, 16]);
    const count = (n: number) => tp1().filter((i) => numberOf(i) === n).length;
    expect([4, 5, 11, 12, 13, 14, 15, 16].map(count)).toEqual([9, 3, 11, 7, 8, 4, 3, 6]);
  });
  test("every TP1 item parses and its answer is accepted by the card", () => {
    for (const item of tp1()) {
      expect(parseMath(item.latex).kind).not.toBe("invalid");
      const ex = catalogExercise(item);
      expect(ex.id.startsWith(`tp1-${item.id}-`)).toBe(true);
      if (item.kind === "solve") {
        const v = (parseMath(item.latex) as { vars: string[] }).vars[0] ?? "x";
        expect(checkExerciseStep(ex, `${v}=${ex.answer[0]}`).status).toBe("solved");
      } else {
        expect(checkExerciseStep(ex, ex.answer[0]!).status).toBe("solved");
        expect(checkExerciseStep(ex, item.latex).status).toBe("progress");
      }
    }
  });
  test("answers match the worksheet numbers", () => {
    const ans = (id: string) => findCatalogItem(id, "tp1")!.answer![0];
    expect(catalogExercise(findCatalogItem("5c", "tp1")!).answer).toEqual(["-1"]);
    expect(catalogExercise(findCatalogItem("16b1", "tp1")!).answer).toEqual(["35"]);
    expect(catalogExercise(findCatalogItem("16c2", "tp1")!).answer).toEqual(["180"]);
    expect(ans("13a")).toBe("8");
    expect(ans("11k")).toBe("\\frac{27}{4}");
  });
});
