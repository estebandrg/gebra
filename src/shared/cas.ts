// Symbolic algebra helpers shared by the web board and the agent CLI.
// Public API is "LaTeX in, LaTeX out" so the board and the agent speak the same language.
import nerdamer from "nerdamer";

type N = any; // nerdamer's typings are loose; keep the casts in one place
const nd = nerdamer as unknown as N;

export type Parsed =
  | { kind: "empty" }
  | { kind: "invalid"; error: string }
  | { kind: "expression"; expr: string; vars: string[] }
  | { kind: "equation"; lhs: string; rhs: string; vars: string[] }
  | { kind: "solutions"; variable: string; values: string[] };

export type StepStatus = "equivalent" | "different" | "unknown";
export interface StepCheck {
  status: StepStatus;
  reason: string;
}

// ---------------------------------------------------------------- parsing

export function normalizeLatex(latex: string): string {
  return latex
    .replace(/\\placeholder(\[[^\]]*\])?\{[^}]*\}/g, "")
    .replace(/\{,\}/g, ".") // Spanish decimal comma from MathLive: 2{,}5
    .replace(/\\times/g, "\\cdot ")
    .replace(/\\div/g, "/")
    .replace(/\\(?:,|;|:|!|quad|qquad)/g, " ")
    .replace(/\\ /g, " ")
    .replace(/\\mathrm\{([^}]*)\}/g, "$1")
    .replace(/\\operatorname\{([^}]*)\}/g, "$1")
    .replace(/\\left\./g, "")
    .replace(/\\right\./g, "")
    .replace(/\\cdot/g, "\\cdot ")
    .trim();
}

/** Words that stay as one token; any other run of letters is a product of variables (35xb = 35·x·b). */
const WORDS = new Set(["sin", "sen", "cos", "tan", "cot", "sec", "csc", "log", "ln", "exp", "abs", "sqrt", "pi", "min", "max"]);

function splitLetters(latex: string): string {
  return latex
    .replace(/(?<![\\a-zA-Z])[a-zA-Z]{2,}(?![a-zA-Z])/g, (run) => (WORDS.has(run) ? run : [...run].join("\\cdot ")))
    // a number right after a letter is a product too: x5 = x·5 (not a variable called x5); x_1, x^2 and \commands are untouched
    .replace(/(?<![\\a-zA-Z_])([a-zA-Z])(?=\d)/g, "$1\\cdot ");
}

function latexToNerd(latex: string): string {
  const src = splitLetters(latex.trim());
  if (!src) throw new Error("vacío");
  const converted = String(nd.convertFromLaTeX(src));
  if (/\b(times|div|cdot|frac|left|right)\b/.test(converted)) throw new Error(`no entendí: ${src}`);
  nd(converted); // throws on syntax errors
  return converted;
}

function varsOf(expr: string): string[] {
  return (nd(expr).variables() as string[]).filter((v) => v !== "i" && v !== "e" && v !== "pi").sort();
}

const SEPARATORS = /\\text\{\s*(?:o|y|or)\s*\}|\\lor|\\vee|,|;/;
const SOLUTION_PART = /^\s*([a-zA-Z])(?:_\{?\w+\}?)?\s*=\s*(.+?)\s*$/;

function parseSolutionList(src: string): Parsed | null {
  const parts = src.split(SEPARATORS).filter((p) => p.trim() !== "");
  if (parts.length < 2) return null;
  let variable = "";
  const values: string[] = [];
  for (const part of parts) {
    const m = part.match(SOLUTION_PART);
    if (!m) return null;
    let value: string;
    try {
      value = latexToNerd(m[2]!);
    } catch {
      return null;
    }
    if (varsOf(value).length > 0) return null;
    if (variable && variable !== m[1]) return null;
    variable = m[1]!;
    values.push(String(nd(value)));
  }
  return { kind: "solutions", variable, values };
}

export function parseMath(latex: string): Parsed {
  const src = normalizeLatex(latex);
  if (!src) return { kind: "empty" };
  const list = parseSolutionList(src);
  if (list) return list;
  const sides = src.split("=");
  try {
    if (sides.length === 1) {
      const expr = latexToNerd(src);
      return { kind: "expression", expr, vars: varsOf(expr) };
    }
    if (sides.length === 2) {
      const lhs = latexToNerd(sides[0]!);
      const rhs = latexToNerd(sides[1]!);
      return { kind: "equation", lhs, rhs, vars: [...new Set([...varsOf(lhs), ...varsOf(rhs)])].sort() };
    }
    return { kind: "invalid", error: "Hay más de un signo =" };
  } catch (e) {
    return { kind: "invalid", error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------- numeric helpers

const SAMPLES = [0.37, 1.73, -2.11, 3.07, -0.59, 2.41, -1.37, 0.83];

function toNumber(text: string): number {
  const frac = text.trim().match(/^\(?(-?[\d.]+)\)?\/\(?(-?[\d.]+)\)?$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(text);
  return Number.isFinite(n) ? n : NaN;
}

function evalAt(expr: string, scope: Record<string, number>): number {
  const sub: Record<string, string> = {};
  for (const [k, v] of Object.entries(scope)) sub[k] = String(v);
  return toNumber(nd(expr, sub).evaluate().text("decimals"));
}

function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a), Math.abs(b));
}

function scopeFor(vars: string[], i: number): Record<string, number> {
  const scope: Record<string, number> = {};
  vars.forEach((v, j) => (scope[v] = SAMPLES[(i + j * 3) % SAMPLES.length]! + j * 0.11));
  return scope;
}

interface Complex {
  re: number;
  im: number;
}

function toComplex(value: string): Complex | null {
  try {
    const re = toNumber(nd(`realpart(${value})`).evaluate().text("decimals"));
    const im = toNumber(nd(`imagpart(${value})`).evaluate().text("decimals"));
    if (!Number.isFinite(re) || !Number.isFinite(im)) return null;
    return { re, im };
  } catch {
    return null;
  }
}

function sameValueSet(a: string[], b: string[]): boolean | null {
  const ca = a.map(toComplex);
  const cb = b.map(toComplex);
  if (ca.some((c) => !c) || cb.some((c) => !c)) return null;
  const eq = (p: Complex, q: Complex) => close(p.re, q.re) && close(p.im, q.im);
  const dedupe = (xs: Complex[]) => xs.filter((x, i) => xs.findIndex((y) => eq(x, y)) === i);
  const da = dedupe(ca as Complex[]);
  const db = dedupe(cb as Complex[]);
  return da.length === db.length && da.every((x) => db.some((y) => eq(x, y)));
}

// ---------------------------------------------------------------- solving

interface SolveSet {
  variable: string;
  all: boolean;
  values: string[];
}

function solveNerd(lhs: string, rhs: string, variable: string): SolveSet {
  const result = nd.solve(`${lhs}=${rhs}`, variable);
  const text = String(result);
  if (text.includes("all")) return { variable, all: true, values: [] };
  const elements: N[] = result._elements ?? result.elements ?? [];
  return { variable, all: false, values: elements.map((e) => String(e)) };
}

function solveSetOf(p: Parsed): SolveSet | null {
  if (p.kind === "solutions") return { variable: p.variable, all: false, values: p.values };
  if (p.kind === "equation") {
    if (p.vars.length > 1) return null;
    const variable = p.vars[0] ?? "x";
    if (p.vars.length === 0) {
      const holds = close(evalAt(p.lhs, {}), evalAt(p.rhs, {}));
      return { variable, all: holds, values: [] };
    }
    return solveNerd(p.lhs, p.rhs, variable);
  }
  return null;
}

export interface Solution {
  variable: string;
  all: boolean;
  solutions: string[];
  latex: string[];
}

export function solveEquation(latex: string, variable?: string): Solution {
  const p = parseMath(latex);
  let lhs: string;
  let rhs: string;
  if (p.kind === "equation") [lhs, rhs] = [p.lhs, p.rhs];
  else if (p.kind === "expression") [lhs, rhs] = [p.expr, "0"];
  else throw new Error(p.kind === "invalid" ? p.error : "No es una ecuación");
  const v = variable ?? (varsOf(`${lhs}-(${rhs})`)[0] || "x");
  const set = solveNerd(lhs, rhs, v);
  return { variable: v, all: set.all, solutions: set.values, latex: set.values.map((s) => prettyTeX(String(nd(s).toTeX()))) };
}

// ---------------------------------------------------------------- step comparison

function compareExpressions(a: string, b: string): StepCheck {
  const vars = [...new Set([...varsOf(a), ...varsOf(b)])];
  let checked = 0;
  for (let i = 0; i < SAMPLES.length; i++) {
    const scope = scopeFor(vars, i);
    const va = evalAt(a, scope);
    const vb = evalAt(b, scope);
    if (Number.isNaN(va) || Number.isNaN(vb)) continue;
    if (!close(va, vb)) return { status: "different", reason: "Las expresiones no valen lo mismo" };
    checked++;
  }
  return checked >= 3
    ? { status: "equivalent", reason: "Expresiones equivalentes" }
    : { status: "unknown", reason: "No pude evaluar las expresiones" };
}

// For multi-variable equations: points on A's zero set must lie on B's and vice versa.
function zeroSetInside(a: { lhs: string; rhs: string }, b: { lhs: string; rhs: string }): boolean | null {
  const fa = `(${a.lhs})-(${a.rhs})`;
  const fb = `(${b.lhs})-(${b.rhs})`;
  const vars = varsOf(fa);
  const allVars = [...new Set([...vars, ...varsOf(fb)])];
  for (const v of vars) {
    let roots: string[];
    try {
      roots = solveNerd(fa, "0", v).values;
    } catch {
      continue;
    }
    if (roots.length === 0) continue;
    const others = allVars.filter((x) => x !== v);
    let checked = 0;
    for (let i = 0; i < 5; i++) {
      const scope = scopeFor(others, i);
      for (const root of roots) {
        const rv = evalAt(root, scope);
        if (Number.isNaN(rv)) continue;
        const val = evalAt(fb, { ...scope, [v]: rv });
        if (Number.isNaN(val)) continue;
        if (Math.abs(val) > 1e-6) return false;
        checked++;
      }
    }
    if (checked >= 2) return true;
  }
  return null;
}

export function compareSteps(previous: string, next: string): StepCheck {
  const a = parseMath(previous);
  const b = parseMath(next);
  if (a.kind === "empty" || b.kind === "empty") return { status: "unknown", reason: "Paso vacío" };
  if (a.kind === "invalid") return { status: "unknown", reason: `No entiendo el paso anterior: ${a.error}` };
  if (b.kind === "invalid") return { status: "unknown", reason: `No entiendo este paso: ${b.error}` };
  try {
    if (a.kind === "expression" && b.kind === "expression") return compareExpressions(a.expr, b.expr);
    if (a.kind === "expression" || b.kind === "expression")
      return { status: "unknown", reason: "Pasaste de una expresión a una ecuación (o al revés)" };

    const sa = solveSetOf(a);
    const sb = solveSetOf(b);
    if (sa && sb) {
      if (sa.all || sb.all)
        return sa.all === sb.all
          ? { status: "equivalent", reason: "Ambas se cumplen para todo valor" }
          : { status: "different", reason: "Una es una identidad y la otra no" };
      const same = sameValueSet(sa.values, sb.values);
      if (same === true) return { status: "equivalent", reason: `Mismas soluciones: {${sa.values.join(", ")}}` };
      if (same === false) {
        const lost = sa.values.length > sb.values.length ? "Se perdieron soluciones" : "Cambió el conjunto solución";
        return { status: "different", reason: `${lost}: antes {${sa.values.join(", ")}}, ahora {${sb.values.join(", ")}}` };
      }
    }
    if (a.kind === "equation" && b.kind === "equation") {
      const ab = zeroSetInside(a, b);
      const ba = zeroSetInside(b, a);
      if (ab === false || ba === false) return { status: "different", reason: "Las ecuaciones no tienen las mismas soluciones" };
      if (ab && ba) return { status: "equivalent", reason: "Ecuaciones equivalentes" };
    }
    return { status: "unknown", reason: "No pude verificar este paso" };
  } catch (e) {
    return { status: "unknown", reason: `No pude verificar: ${e instanceof Error ? e.message : e}` };
  }
}

// ---------------------------------------------------------------- tools

/** Drop multiplication dots a human would not write: 2 \cdot x -> 2x, ) \cdot ( -> )(. */
export function prettyTeX(tex: string): string {
  return tex
    .replace(/(\d) \\cdot (?=[a-zA-Z\\])/g, "$1")
    .replace(/\\right\) \\cdot \\left\(/g, "\\right)\\left(")
    .replace(/(\d) \\cdot \\left\(/g, "$1\\left(")
    .replace(/([a-zA-Z]) \\cdot \\left\(/g, "$1\\left(");
}

function exprOf(latex: string): string {
  const p = parseMath(latex);
  if (p.kind === "expression") return p.expr;
  if (p.kind === "equation") return `(${p.lhs})-(${p.rhs})`;
  throw new Error(p.kind === "invalid" ? p.error : "Se esperaba una expresión");
}

export function toTeX(exprOrLatex: string): string {
  let expr: string;
  try {
    nd(exprOrLatex);
    expr = exprOrLatex;
  } catch {
    expr = exprOf(exprOrLatex);
  }
  return prettyTeX(String(nd(expr).toTeX()));
}

export function factor(latex: string): string {
  return prettyTeX(String(nd(`factor(${exprOf(latex)})`).toTeX()));
}

export function expand(latex: string): string {
  return prettyTeX(String(nd(`expand(${exprOf(latex)})`).toTeX()));
}

export function simplify(latex: string): string {
  return prettyTeX(String(nd(`simplify(${exprOf(latex)})`).toTeX()));
}

export function divide(dividend: string, divisor: string): { quotient: string; remainder: string } {
  const out = nd(`div(${exprOf(dividend)},${exprOf(divisor)})`);
  const [q, r] = (out.symbol?.elements ?? out._elements ?? out.elements) as N[];
  return { quotient: prettyTeX(String(nd(String(q)).toTeX())), remainder: prettyTeX(String(nd(String(r)).toTeX())) };
}

export function evaluate(latex: string, scope: Record<string, number>): number {
  return evalAt(exprOf(latex), scope);
}

export function realRoots(latex: string): number[] {
  const expr = exprOf(latex);
  const v = varsOf(expr)[0] ?? "x";
  const set = solveNerd(expr, "0", v);
  const out: number[] = [];
  for (const s of set.values) {
    const c = toComplex(s);
    if (!c || Math.abs(c.im) > 1e-9) continue;
    const r = Math.round(c.re * 1e9) / 1e9;
    if (!out.some((x) => close(x, r))) out.push(r);
  }
  return out.sort((x, y) => x - y);
}

export function compile(latex: string): (x: number) => number {
  const expr = exprOf(latex);
  const v = varsOf(expr)[0] ?? "x";
  const fn = nd(expr).buildFunction([v]) as (x: number) => number;
  return (x) => {
    const y = fn(x);
    return typeof y === "number" ? y : NaN;
  };
}

/** True when `latex` states exactly the expected solution set (e.g. "x=3" or "x=2 o x=3"). */
export function checkAnswer(latex: string, expected: string[]): boolean {
  const p = parseMath(latex);
  let values: string[] | null = null;
  if (p.kind === "solutions") values = p.values;
  if (p.kind === "equation" && /^[a-zA-Z](_\w+)?$/.test(p.lhs) && varsOf(p.rhs).length === 0) values = [p.rhs];
  if (!values) return false;
  const exp = expected.map((e) => {
    try {
      nd(e);
      return e;
    } catch {
      return exprOf(e);
    }
  });
  return sameValueSet(values, exp) === true;
}
