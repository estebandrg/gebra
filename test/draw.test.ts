import { describe, expect, test } from "bun:test";
import { simplify, strokePath, strokeToItem } from "../src/shared/draw";

describe("freehand strokes", () => {
  test("simplify keeps the ends and drops collinear points", () => {
    expect(simplify([[0, 0], [1, 0], [2, 0], [3, 0]], 0.5)).toEqual([[0, 0], [3, 0]]);
  });

  test("simplify keeps a real corner", () => {
    expect(simplify([[0, 0], [5, 0], [5, 5]], 0.5)).toEqual([[0, 0], [5, 0], [5, 5]]);
  });

  test("strokeToItem stores points relative to a padded box that contains the stroke", () => {
    const it = strokeToItem([[100, 200], [140, 260]], "yellow", 4)!;
    expect(it.kind).toBe("draw");
    expect(it.color).toBe("yellow");
    expect(it.size).toBe(4);
    expect(it.x).toBeLessThan(100);
    expect(it.y).toBeLessThan(200);
    expect(it.x + it.w).toBeGreaterThan(140);
    expect(it.y + it.h).toBeGreaterThan(260);
    expect(it.pts[0]).toEqual([100 - it.x, 200 - it.y]);
  });

  test("a single tap becomes a dot (two points)", () => {
    expect(strokeToItem([[10, 10]], "pink", 6)!.pts).toHaveLength(2);
  });

  test("no points, no item", () => {
    expect(strokeToItem([], "white", 4)).toBeNull();
  });

  test("strokePath starts with M and ends on the last point", () => {
    const d = strokePath([[0, 0], [10, 5], [20, 0], [30, 10]]);
    expect(d.startsWith("M0 0")).toBe(true);
    expect(d.endsWith("L30 10")).toBe(true);
    expect(d).toContain("Q");
  });
});
