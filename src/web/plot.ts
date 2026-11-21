// SVG plotter for polynomials/equations in x. Curves are separate <path>s so the player can
// "draw" them with chalk, and roots/intersections become labelled marks.
import { compile, normalizeLatex, realRoots } from "../shared/cas";
import type { PlotMark } from "../shared/types";
import { renderMath } from "./render";

const NS = "http://www.w3.org/2000/svg";
const COLORS = ["var(--chalk-yellow)", "var(--chalk-blue)", "var(--chalk-pink)", "var(--chalk-green)"];

interface Curve {
  latex: string;
  fn: (x: number) => number;
}

/** Curves and notable points for one board line: expression, y = f(x), or f(x) = g(x). */
export function curvesFor(latex: string): { curves: Curve[]; marks: PlotMark[] } {
  const src = normalizeLatex(latex);
  const sides = src.split("=");
  const curve = (l: string): Curve => ({ latex: l, fn: compile(l) });
  const rootsOf = (l: string, at?: (x: number) => number): PlotMark[] => {
    try {
      return realRoots(l).map((x) => ({ x, y: at ? at(x) : 0 }));
    } catch {
      return [];
    }
  };
  if (sides.length === 1) return { curves: [curve(src)], marks: rootsOf(src) };
  const [lhs, rhs] = sides.map((s) => s.trim()) as [string, string];
  if (/^(y|f\(x\)|f\\left\(x\\right\))$/.test(lhs)) return { curves: [curve(rhs)], marks: rootsOf(rhs) };
  if (rhs === "0") return { curves: [curve(lhs)], marks: rootsOf(lhs) };
  if (lhs === "0") return { curves: [curve(rhs)], marks: rootsOf(rhs) };
  const left = curve(lhs);
  return { curves: [left, curve(rhs)], marks: rootsOf(`${lhs}-\\left(${rhs}\\right)`, left.fn) };
}

function niceStep(span: number) {
  const raw = span / 7;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pow;
}

const fmt = (n: number) => {
  const r = Math.round(n * 1000) / 1000;
  return Number.isInteger(r) ? String(r) : String(r).replace(".", ",");
};

export interface PlotSpec {
  exprs: string[];
  xRange: [number, number];
  yRange?: [number, number];
  marks?: PlotMark[];
  w: number;
  h: number;
}

export interface BuiltPlot {
  svg: SVGSVGElement;
  frame: SVGGElement;
  curves: SVGPathElement[];
  marks: SVGGElement[];
  legend: SVGForeignObjectElement[];
}

export function buildPlot(spec: PlotSpec): BuiltPlot {
  const { w, h } = spec;
  const pad = { l: 34, r: 12, t: 12, b: 24 };
  const curves: Curve[] = [];
  let autoMarks: PlotMark[] = [];
  for (const e of spec.exprs) {
    try {
      const c = curvesFor(e);
      curves.push(...c.curves);
      autoMarks.push(...c.marks);
    } catch {
      /* skip unparsable */
    }
  }
  const [x0, x1] = spec.xRange;
  const N = 480;
  const xs = Array.from({ length: N + 1 }, (_, i) => x0 + ((x1 - x0) * i) / N);
  const samples = curves.map((c) => xs.map((x) => c.fn(x)));

  let [y0, y1] = spec.yRange ?? [NaN, NaN];
  const marks = (spec.marks ?? autoMarks).map((m) => ({ ...m, y: m.y ?? curves[0]?.fn(m.x) ?? 0 }));
  if (!spec.yRange) {
    const ys = samples.flat().filter(Number.isFinite).sort((a, b) => a - b);
    const lo = ys[Math.floor(ys.length * 0.04)] ?? -5;
    const hi = ys[Math.floor(ys.length * 0.96)] ?? 5;
    y0 = Math.min(lo, 0, ...marks.map((m) => m.y!));
    y1 = Math.max(hi, 0, ...marks.map((m) => m.y!));
    if (y1 - y0 < 2) [y0, y1] = [y0 - 1, y1 + 1];
    const m = (y1 - y0) * 0.12;
    [y0, y1] = [y0 - m, y1 + m];
  }
  const px = (x: number) => pad.l + ((x - x0) / (x1 - x0)) * (w - pad.l - pad.r);
  const py = (y: number) => pad.t + ((y1 - y) / (y1 - y0)) * (h - pad.t - pad.b);

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(h));
  svg.setAttribute("class", "plot-svg");
  const g = (cls: string, parent: SVGElement = svg) => {
    const e = document.createElementNS(NS, "g");
    e.setAttribute("class", cls);
    parent.appendChild(e);
    return e;
  };
  const line = (parent: SVGElement, cls: string, a: number, b: number, c: number, d: number) => {
    const l = document.createElementNS(NS, "line");
    l.setAttribute("class", cls);
    l.setAttribute("x1", String(a));
    l.setAttribute("y1", String(b));
    l.setAttribute("x2", String(c));
    l.setAttribute("y2", String(d));
    parent.appendChild(l);
  };
  const text = (parent: SVGElement, s: string, x: number, y: number, anchor = "middle") => {
    const t = document.createElementNS(NS, "text");
    t.textContent = s;
    t.setAttribute("x", String(x));
    t.setAttribute("y", String(y));
    t.setAttribute("text-anchor", anchor);
    parent.appendChild(t);
    return t;
  };

  const frame = g("frame");
  const sx = niceStep(x1 - x0);
  const sy = niceStep(y1 - y0);
  for (let x = Math.ceil(x0 / sx) * sx; x <= x1 + 1e-9; x += sx) {
    line(frame, "grid", px(x), pad.t, px(x), h - pad.b);
    if (Math.abs(x) > 1e-9) text(frame, fmt(x), px(x), Math.min(Math.max(py(0) + 15, pad.t + 12), h - 6));
  }
  for (let y = Math.ceil(y0 / sy) * sy; y <= y1 + 1e-9; y += sy) {
    line(frame, "grid", pad.l, py(y), w - pad.r, py(y));
    if (Math.abs(y) > 1e-9) text(frame, fmt(y), Math.min(Math.max(px(0) - 5, pad.l - 2), w - 30), py(y) + 4, "end");
  }
  if (y0 <= 0 && y1 >= 0) line(frame, "axis", pad.l, py(0), w - pad.r, py(0));
  if (x0 <= 0 && x1 >= 0) line(frame, "axis", px(0), pad.t, px(0), h - pad.b);

  const curveEls = samples.map((ys, ci) => {
    let d = "";
    let pen = false;
    ys.forEach((y, i) => {
      const ok = Number.isFinite(y) && y > y0 - (y1 - y0) * 3 && y < y1 + (y1 - y0) * 3;
      if (!ok) return (pen = false);
      d += `${pen ? "L" : "M"}${px(xs[i]!).toFixed(1)},${py(y).toFixed(1)}`;
      pen = true;
    });
    const p = document.createElementNS(NS, "path");
    p.setAttribute("class", "curve");
    p.setAttribute("d", d);
    p.style.stroke = COLORS[ci % COLORS.length]!;
    svg.appendChild(p);
    return p;
  });

  const legend = curves.map((c, ci) => {
    const fo = document.createElementNS(NS, "foreignObject");
    fo.setAttribute("x", String(pad.l + 8));
    fo.setAttribute("y", String(pad.t + ci * 30));
    fo.setAttribute("width", String(w - pad.l - 20));
    fo.setAttribute("height", "30");
    const div = document.createElement("div");
    div.style.cssText = `color:${COLORS[ci % COLORS.length]};font-size:17px;`;
    renderMath(div, `y=${c.latex}`);
    fo.appendChild(div);
    svg.appendChild(fo);
    return fo;
  });

  const markEls = marks
    .filter((m) => m.x >= x0 && m.x <= x1 && m.y! >= y0 && m.y! <= y1)
    .map((m) => {
      const mg = g("mark");
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", String(px(m.x)));
      c.setAttribute("cy", String(py(m.y!)));
      c.setAttribute("r", "6");
      c.style.fill = "var(--chalk-white)";
      mg.appendChild(c);
      const label = m.label ?? (Math.abs(m.y!) < 1e-9 ? `x = ${fmt(m.x)}` : `(${fmt(m.x)}; ${fmt(m.y!)})`);
      text(mg, label, px(m.x), py(m.y!) - 12);
      return mg;
    });

  return { svg, frame, curves: curveEls, marks: markEls, legend };
}
