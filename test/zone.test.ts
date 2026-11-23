import { describe, expect, test } from "bun:test";
import { describeStroke, describeZone, inZone, strokeRelations, type Scene, type SceneElement } from "../src/shared/zone";

const math = (id: string, x: number, y: number, latex: string, extra: Partial<SceneElement> = {}): SceneElement => ({
  id,
  source: "pizarra",
  kind: "math",
  rect: { x, y, w: 200, h: 50 },
  latex,
  ...extra,
});
const line = (n: number, x0: number, y0: number, x1: number, y1: number): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);

describe("inZone", () => {
  const zone = { x: 0, y: 0, w: 300, h: 100 };
  test("fully inside is completo, half inside is parcial, outside is null", () => {
    expect(inZone(zone, { x: 10, y: 10, w: 100, h: 40 })).toBe("completo");
    expect(inZone(zone, { x: 250, y: 10, w: 100, h: 40 })).toBe("parcial");
    expect(inZone(zone, { x: 280, y: 10, w: 100, h: 40 })).toBeNull();
  });
});

describe("describeStroke", () => {
  test("horizontal straight line", () => {
    const s = describeStroke(line(10, 0, 0, 140, 2));
    expect(s.kind).toBe("recta");
    expect(s.dir).toBe("horizontal");
    expect(s.label).toContain("horizontal");
    expect(s.label).toContain("140 px");
  });
  test("diagonal direction is reported", () => {
    expect(describeStroke(line(10, 0, 100, 100, 0)).label).toContain("ascendente");
    expect(describeStroke(line(10, 0, 0, 100, 100)).label).toContain("descendente");
  });
  test("closed round loop is a circle", () => {
    const pts = Array.from({ length: 41 }, (_, i) => [100 + 50 * Math.cos((i / 40) * 2 * Math.PI), 100 + 50 * Math.sin((i / 40) * 2 * Math.PI)] as [number, number]);
    const s = describeStroke(pts);
    expect(s.kind).toBe("cerrada");
    expect(s.label).toContain("círculo");
  });
  test("a wavy stroke is a curve and a tiny one is a dot", () => {
    const wave = Array.from({ length: 30 }, (_, i) => [i * 6, 30 * Math.sin(i / 2)] as [number, number]);
    expect(describeStroke(wave).kind).toBe("curva");
    expect(describeStroke([[5, 5], [6, 5]]).kind).toBe("punto");
  });
});

describe("strokeRelations", () => {
  const target = math("m3", 100, 100, "2x+3=7");
  test("a horizontal line under the text underlines it", () => {
    expect(strokeRelations(describeStroke(line(8, 100, 160, 300, 160)), [target])).toEqual(["subraya [m3]"]);
  });
  test("a line through the middle strikes it out", () => {
    expect(strokeRelations(describeStroke(line(8, 95, 125, 305, 125)), [target])).toEqual(["tacha [m3]"]);
  });
  test("a loop around it encloses it", () => {
    const loop = Array.from({ length: 41 }, (_, i) => [200 + 190 * Math.cos((i / 40) * 2 * Math.PI), 125 + 70 * Math.sin((i / 40) * 2 * Math.PI)] as [number, number]);
    expect(strokeRelations(describeStroke(loop), [target])).toEqual(["encierra [m3]"]);
  });
  test("a line far away relates to nothing", () => {
    expect(strokeRelations(describeStroke(line(8, 100, 400, 300, 400)), [target])).toEqual([]);
  });
});

describe("describeZone", () => {
  const scene: Scene = {
    elements: [
      math("m1", 0, 0, "2x+3=7"),
      math("m2", 0, 80, "2x=5", { verdict: "✗ no es equivalente" }),
      math("paso2", 400, 0, "2x+3-3=7-3", { source: "presentación", color: "yellow" }),
      math("m9", 0, 900, "lejos"),
    ],
    notes: [{ type: "highlight", target: "paso2", style: "box", color: "pink", label: "resto 3" }],
    presentation: { title: "Resolver 2x+3=7", step: 2, total: 5, caption: "Resto 3 de ambos lados" },
  };

  test("lists inside elements top to bottom with exact LaTeX and CAS verdict; board ids exclude presentation ones", () => {
    const z = describeZone({ x: -10, y: -10, w: 700, h: 200 }, scene);
    expect(z.ids).toEqual(["m1", "m2"]);
    expect(z.count).toBe(3);
    expect(z.detail).toContain("[m1] (pizarra) ecuación: $2x+3=7$");
    expect(z.detail).toContain("✗ no es equivalente");
    expect(z.detail).not.toContain("lejos");
  });

  test("presentation elements carry the assistant's highlight and the step caption", () => {
    const z = describeZone({ x: 390, y: -10, w: 300, h: 100 }, scene);
    expect(z.ids).toEqual([]);
    expect(z.detail).toContain("Presentación «Resolver 2x+3=7», paso 2/5");
    expect(z.detail).toContain("Resto 3 de ambos lados");
    expect(z.detail).toContain("resaltó con caja rosa «resto 3»");
    expect(z.detail).toContain("(presentación)");
  });

  test("an empty zone says so and a hand-drawn underline is related to its target", () => {
    expect(describeZone({ x: 2000, y: 2000, w: 50, h: 50 }, scene).detail).toContain("sin elementos");
    const withStroke: Scene = {
      ...scene,
      elements: [...scene.elements, { id: "d1", source: "pizarra", kind: "draw", color: "red", rect: { x: 0, y: 55, w: 200, h: 10 }, stroke: { pts: line(8, 0, 58, 190, 60), size: 4 } }],
    };
    const z = describeZone({ x: -10, y: -10, w: 300, h: 200 }, withStroke);
    expect(z.detail).toContain("[d1] (pizarra) dibujo a mano rojo: línea recta horizontal");
    expect(z.detail).toMatch(/subraya \[m1\]/);
  });
});
