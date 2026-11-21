import { describe, expect, test } from "bun:test";
import { cardLines, cardProgress } from "../src/shared/cards";
import type { Board, CardItem, Exercise, Item } from "../src/shared/types";

const ex: Exercise = { id: "ex1", topic: "lineal", level: 1, kind: "solve", prompt: "Resolvé", latex: "2x+3=7", answer: ["2"] };
const card: CardItem = { id: "c1", kind: "card", x: 0, y: 0, exercise: "ex1" };
const line = (id: string, latex: string, y = 0): Item => ({ id, kind: "math", x: 0, y, latex, card: "c1", exercise: "ex1" });
const board = (items: Item[], exercises = [ex]): Board => ({
  version: 1,
  items: [card, ...items],
  exercises,
  selection: [],
  view: { x: 0, y: 0, zoom: 1 },
  updatedAt: "",
});

describe("cardLines", () => {
  test("keeps the board order, not the y coordinate, and ignores other items", () => {
    const b = board([line("m2", "2x=4", 0), { id: "m9", kind: "math", x: 0, y: 0, latex: "y=1" }, line("m3", "x=2", -50)]);
    expect(cardLines(b, "c1").map((l) => l.id)).toEqual(["m2", "m3"]);
  });
});

describe("cardProgress", () => {
  test("the first line is checked against the statement and the last one solves it", () => {
    const p = cardProgress(board([line("m2", "2x=4"), line("m3", "x=2")]), card);
    expect(p.lines.map((l) => [l.id, l.check?.status])).toEqual([
      ["m2", "equivalent"],
      ["m3", "equivalent"],
    ]);
    expect(p.status).toBe("solved");
  });

  test("a wrong step is flagged and the card is not solved", () => {
    const p = cardProgress(board([line("m2", "2x=10"), line("m3", "x=5")]), card);
    expect(p.lines[0]!.check?.status).toBe("different");
    expect(p.status).not.toBe("solved");
  });

  test("an empty card has no lines and status empty", () => {
    expect(cardProgress(board([]), card)).toEqual({ exercise: ex, lines: [], status: "empty", reason: "" });
  });

  test("division cards do not compare the first line with the statement", () => {
    const div: Exercise = { ...ex, kind: "divide", latex: "\\left(x^2-1\\right)\\div\\left(x-1\\right)", answer: ["x+1", "0"] };
    const p = cardProgress(board([line("m2", "C=x+1,\\ R=0")], [div]), card);
    expect(p.lines[0]!.check).toBeNull();
    expect(p.status).toBe("solved");
  });
});

describe("gebra board (CLI view)", () => {
  test("prints a card with its fixed statement, checked lines, status and expected answer", async () => {
    const { renderBoard } = await import("../bin/gebra");
    const out = renderBoard(board([line("m2", "2x=4"), line("m3", "x=5")]));
    expect(out).toContain('Tarjeta c1 — ejercicio ex1 (lineal nivel 1, solve) · enunciado fijo: "Resolvé": 2x+3=7');
    expect(out).toContain("  1. [m2] math: 2x=4  ✓ equivalente");
    expect(out).toMatch(/ {2}2\. \[m3\] math: x=5 {2}✗ /);
    expect(out).toContain("respuesta esperada (no revelar en modo tutor): x=2");
    expect(out).not.toContain("Sueltos");
    expect(out).not.toContain("Ejercicio sin empezar");
  });

  test("an empty card says so", async () => {
    const { renderBoard } = await import("../bin/gebra");
    expect(renderBoard(board([]))).toContain("  (sin pasos todavía)");
  });

  test("loose items and legacy chains still print as before", async () => {
    const { renderBoard } = await import("../bin/gebra");
    const b = board([{ id: "t1", kind: "text", x: 1, y: 2, text: "hola" }]);
    b.items = b.items.filter((i) => i.kind !== "card");
    b.exercises = [];
    expect(renderBoard(b)).toContain("Sueltos\n  [t1] (1,2) texto: hola");
  });
});

describe("tools in the CLI view", () => {
  test("a tool inside a card is listed under the card, a loose one under Sueltos", async () => {
    const { renderBoard } = await import("../bin/gebra");
    const b = board([
      { id: "w1", kind: "tool", x: 0, y: 0, tool: "ruffini", card: "c1", data: {} },
      { id: "w2", kind: "tool", x: 5, y: 6, tool: "gauss", data: {} },
    ]);
    const out = renderBoard(b);
    expect(out).toContain("  · [w1] Ruffini: ");
    expect(out).toContain("Sueltos\n  [w2] (5,6) herramienta Gauss: ");
  });
});
