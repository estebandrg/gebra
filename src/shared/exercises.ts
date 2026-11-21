// Offline exercise generator for equations and polynomials, plus progress checking of a learner step.
import { compareSteps, normalizeLatex, parseMath, checkAnswer, toTeX } from "./cas";
import type { Exercise, Topic } from "./types";

type Level = 1 | 2 | 3;

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const nonZero = (min: number, max: number) => {
    let v = 0;
    while (v === 0) v = int(min, max);
    return v;
  };
  const pick = <T>(xs: T[]) => xs[int(0, xs.length - 1)]!;
  return { int, nonZero, pick };
}

/** Polynomial (coefficients, highest degree first) to LaTeX. */
export function polyTeX(coeffs: number[], v = "x"): string {
  const deg = coeffs.length - 1;
  let out = "";
  coeffs.forEach((c, i) => {
    if (c === 0) return;
    const p = deg - i;
    const abs = Math.abs(c);
    const sign = c < 0 ? "-" : out ? "+" : "";
    const coef = abs === 1 && p > 0 ? "" : String(abs);
    const pow = p === 0 ? "" : p === 1 ? v : `${v}^{${p}}`;
    out += `${sign}${coef}${pow}`;
  });
  return out || "0";
}

const lin = (a: number, b: number) => polyTeX([a, b]);
const paren = (s: string) => `\\left(${s}\\right)`;

function mulPoly(p: number[], q: number[]): number[] {
  const out = new Array(p.length + q.length - 1).fill(0);
  p.forEach((a, i) => q.forEach((b, j) => (out[i + j] += a * b)));
  return out;
}

function addPoly(p: number[], q: number[], sign = 1): number[] {
  const n = Math.max(p.length, q.length);
  const pp = [...new Array(n - p.length).fill(0), ...p];
  const qq = [...new Array(n - q.length).fill(0), ...q];
  const out = pp.map((a, i) => a + sign * qq[i]!);
  while (out.length > 1 && out[0] === 0) out.shift();
  return out;
}

function fraction(n: number, d: number): string {
  const g = (x: number, y: number): number => (y === 0 ? Math.abs(x) : g(y, x % y));
  const k = g(n, d) * Math.sign(d);
  const [nn, dd] = [n / k, d / k];
  return dd === 1 ? String(nn) : `${nn}/${dd}`;
}

let counter = 0;
const newId = () => `ex${Date.now().toString(36)}${(counter++).toString(36)}`;

export function generateExercise(topic: Topic, level: Level, seed = Math.floor(Math.random() * 1e9)): Exercise {
  const r = rng(seed);
  const base = { id: `ex-${topic}-${level}-${seed}`, topic, level };

  switch (topic) {
    case "lineal": {
      const x = r.int(-9, 9);
      if (level === 1) {
        const a = r.nonZero(2, 9) * r.pick([1, -1]);
        const b = r.nonZero(-15, 15);
        return { ...base, kind: "solve", prompt: "Resolvé la ecuación", latex: `${lin(a, b)}=${a * x + b}`, answer: [String(x)] };
      }
      if (level === 2) {
        const a = r.nonZero(-9, 9);
        let c = r.nonZero(-9, 9);
        if (c === a) c = a + 1 || 2;
        const b = r.int(-12, 12);
        const d = (a - c) * x + b;
        return { ...base, kind: "solve", prompt: "Resolvé la ecuación", latex: `${lin(a, b)}=${lin(c, d)}`, answer: [String(x)] };
      }
      // level 3: a(x+b) - c = d(x+e) with rational solution
      const a = r.nonZero(2, 6);
      const b = r.nonZero(-7, 7);
      const c = r.int(1, 9);
      let d = r.nonZero(-5, 5);
      if (d === a) d = -a;
      const e = r.nonZero(-7, 7);
      // a x + ab - c = d x + de  ->  x = (de - ab + c) / (a - d)
      const num = d * e - a * b + c;
      const den = a - d;
      return {
        ...base,
        kind: "solve",
        prompt: "Resolvé la ecuación (aplicá distributiva primero)",
        latex: `${a}${paren(lin(1, b))}-${c}=${d === 1 ? "" : d === -1 ? "-" : d}${paren(lin(1, e))}`,
        answer: [fraction(num, den)],
      };
    }

    case "cuadratica": {
      if (level === 1) {
        const k = r.int(1, 9);
        if (r.pick([true, false])) {
          return { ...base, kind: "solve", prompt: "Resolvé (despejá el cuadrado)", latex: `x^{2}=${k * k}`, answer: [String(k), String(-k)] };
        }
        const a = r.int(2, 4);
        return { ...base, kind: "solve", prompt: "Resolvé (despejá el cuadrado)", latex: `${a}x^{2}-${a * k * k}=0`, answer: [String(k), String(-k)] };
      }
      const r1 = r.int(-7, 7);
      let r2 = r.int(-7, 7);
      if (level === 2 && r2 === r1) r2 = r1 + 2;
      if (level === 2) {
        const coeffs = mulPoly([1, -r1], [1, -r2]);
        return { ...base, kind: "solve", prompt: "Resolvé la ecuación cuadrática", latex: `${polyTeX(coeffs)}=0`, answer: [...new Set([String(r1), String(r2)])] };
      }
      // level 3: a != 1, one rational root p/q
      const q = r.int(2, 3);
      let p = r.nonZero(-5, 5);
      if (p % q === 0) p += 1;
      const coeffs = mulPoly([q, -p], [1, -r2]);
      const answer = [...new Set([fraction(p, q), String(r2)])];
      return { ...base, kind: "solve", prompt: "Resolvé la ecuación cuadrática (fórmula resolvente)", latex: `${polyTeX(coeffs)}=0`, answer };
    }

    case "factorizar": {
      if (level === 1) {
        const k = r.int(2, 6);
        const a = r.nonZero(-5, 5);
        const b = r.nonZero(-9, 9);
        // k x (a x + b) = k a x^2 + k b x
        const answer = `${k}x${paren(lin(a, b))}`;
        return { ...base, kind: "factor", prompt: "Factorizá (factor común)", latex: polyTeX([k * a, k * b, 0]), answer: [answer] };
      }
      if (level === 2) {
        if (r.pick([true, false])) {
          const a = r.int(1, 9);
          return { ...base, kind: "factor", prompt: "Factorizá (diferencia de cuadrados)", latex: `x^{2}-${a * a}`, answer: [`${paren(lin(1, -a))}${paren(lin(1, a))}`] };
        }
        const r1 = r.nonZero(-7, 7);
        let r2 = r.nonZero(-7, 7);
        if (r2 === r1) r2 = -r1 || 3;
        return {
          ...base,
          kind: "factor",
          prompt: "Factorizá el trinomio",
          latex: polyTeX(mulPoly([1, -r1], [1, -r2])),
          answer: [`${paren(lin(1, -r1))}${paren(lin(1, -r2))}`],
        };
      }
      const roots = [r.nonZero(-4, 4), r.nonZero(-4, 4), r.nonZero(-4, 4)];
      const coeffs = roots.reduce<number[]>((acc, x) => mulPoly(acc, [1, -x]), [1]);
      return {
        ...base,
        kind: "factor",
        prompt: "Factorizá (buscá raíces con Gauss/Ruffini)",
        latex: polyTeX(coeffs),
        answer: [roots.map((x) => paren(lin(1, -x))).join("")],
      };
    }

    case "operaciones": {
      if (level === 1) {
        const p = [r.int(-5, 5), r.int(-9, 9), r.int(-9, 9)];
        const q = [r.nonZero(-5, 5), r.int(-9, 9), r.int(-9, 9)];
        const sign = r.pick([1, -1]);
        const result = addPoly(p, q, sign);
        return {
          ...base,
          kind: "expand",
          prompt: sign === 1 ? "Sumá los polinomios" : "Restá los polinomios",
          latex: `${paren(polyTeX(p))}${sign === 1 ? "+" : "-"}${paren(polyTeX(q))}`,
          answer: [polyTeX(result)],
        };
      }
      if (level === 2) {
        const p = [r.nonZero(1, 4), r.int(-7, 7)];
        const q = [r.nonZero(1, 4), r.int(-7, 7)];
        return { ...base, kind: "expand", prompt: "Multiplicá y reducí", latex: `${paren(polyTeX(p))}${paren(polyTeX(q))}`, answer: [polyTeX(mulPoly(p, q))] };
      }
      const p = [r.nonZero(1, 3), r.int(-5, 5)];
      const q = [r.nonZero(1, 3), r.int(-5, 5), r.int(-5, 5)];
      return { ...base, kind: "expand", prompt: "Multiplicá y reducí", latex: `${paren(polyTeX(p))}${paren(polyTeX(q))}`, answer: [polyTeX(mulPoly(p, q))] };
    }

    case "division": {
      const a = r.nonZero(-4, 4);
      const deg = level === 1 ? 2 : 3;
      const quotient = Array.from({ length: deg }, (_, i) => (i === 0 ? r.nonZero(1, 4) : r.int(-6, 6)));
      const rem = level === 1 ? 0 : r.int(-9, 9);
      const dividend = addPoly(mulPoly(quotient, [1, -a]), [rem]);
      return {
        ...base,
        kind: "divide",
        prompt: level === 3 ? "Dividí (podés usar Ruffini). Escribí cociente y resto: C = ..., R = ..." : "Dividí con Ruffini. Escribí cociente y resto: C = ..., R = ...",
        latex: `${paren(polyTeX(dividend))}\\div${paren(lin(1, -a))}`,
        answer: [polyTeX(quotient), String(rem)],
      };
    }
  }
}

export function makeExercise(topic: Topic, level: Level): Exercise {
  return { ...generateExercise(topic, level), id: newId() };
}

// ---------------------------------------------------------------- learner progress

export type ProgressStatus = "solved" | "progress" | "wrong" | "unknown";

/** Count top-level additive terms of a LaTeX polynomial. */
function termCount(latex: string): number {
  const s = normalizeLatex(latex).replace(/^[+-]/, "");
  let depth = 0;
  let terms = 1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if ("({[".includes(ch)) depth++;
    else if (")}]".includes(ch)) depth--;
    else if ((ch === "+" || ch === "-") && depth === 0 && s[i - 1] !== "^") terms++;
  }
  return terms;
}

/** Non-constant factor count (with multiplicity) of the nerdamer form, e.g. (x-1)^2*(x+2) -> 3. */
function factorCount(latex: string): number {
  const p = parseMath(latex);
  if (p.kind !== "expression") return 0;
  const s = p.expr;
  let depth = 0;
  let start = 0;
  const factors: string[] = [];
  for (let i = 0; i <= s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if ((ch === "*" || ch === undefined) && depth === 0) {
      factors.push(s.slice(start, i));
      start = i + 1;
    } else if ((ch === "+" || ch === "-") && depth === 0 && i > 0) return 1; // top-level sum
  }
  let count = 0;
  for (const f of factors) {
    if (!/[a-z]/i.test(f)) continue;
    const pow = f.match(/^\(.*\)\^(\d+)$/) ?? f.match(/^[a-z]\^(\d+)$/i);
    count += pow ? Number(pow[1]) : 1;
  }
  return count;
}

/** Final answers of an equation with no solution or with infinitely many: `answer` is ["none"] or ["all"]. */
const NONE_WORDS = /sin\s*soluci|ninguna|no\s*tiene|\\emptyset|\\varnothing|\\nexists|\{\s*\}/i;
const ALL_WORDS = /infinit|todos|cualquier|\\mathbb\{R\}|\\R\b|\\forall/i;

/** Does this line state the special final answer (a numeric contradiction/identity, `x=x`, or the words)? */
function statesSpecialAnswer(want: "none" | "all", latex: string): boolean {
  if ((want === "none" ? NONE_WORDS : ALL_WORDS).test(latex)) return true;
  const p = parseMath(latex);
  if (p.kind !== "equation") return false;
  if (p.vars.length === 0) return (compareSteps(`${p.lhs}-(${p.rhs})`, "0").status === "equivalent") === (want === "all");
  return want === "all" && p.lhs === p.rhs;
}

export function checkExerciseStep(ex: Exercise, latex: string): { status: ProgressStatus; reason: string } {
  if (!latex.trim()) return { status: "unknown", reason: "" };
  switch (ex.kind) {
    case "solve": {
      const special = ex.answer.length === 1 && (ex.answer[0] === "none" || ex.answer[0] === "all") ? (ex.answer[0] as "none" | "all") : null;
      if (special) {
        if (statesSpecialAnswer(special, latex)) return { status: "solved", reason: "¡Resuelto!" };
        const cmp = compareSteps(ex.latex, latex);
        if (cmp.status === "equivalent") return { status: "progress", reason: "Vas bien, seguí simplificando" };
        if (cmp.status === "different") return { status: "wrong", reason: cmp.reason };
        return { status: "unknown", reason: cmp.reason };
      }
      if (checkAnswer(latex, ex.answer)) return { status: "solved", reason: "¡Resuelto!" };
      const cmp = compareSteps(ex.latex, latex);
      if (cmp.status === "equivalent") return { status: "progress", reason: "Vas bien, seguí despejando" };
      if (cmp.status === "different") return { status: "wrong", reason: cmp.reason };
      return { status: "unknown", reason: cmp.reason };
    }
    case "factor":
    case "expand": {
      const cmp = compareSteps(ex.latex, latex);
      if (cmp.status === "different") return { status: "wrong", reason: cmp.reason };
      if (cmp.status !== "equivalent") return { status: "unknown", reason: cmp.reason };
      const done =
        ex.kind === "factor"
          ? factorCount(latex) >= factorCount(ex.answer[0]!)
          : !/\(/.test(normalizeLatex(latex).replace(/\\left|\\right/g, "")) && termCount(latex) <= termCount(ex.answer[0]!);
      return done ? { status: "solved", reason: "¡Resuelto!" } : { status: "progress", reason: "Es equivalente, pero todavía no terminaste" };
    }
    case "divide": {
      const [q, rem] = ex.answer as [string, string];
      const parts = normalizeLatex(latex)
        .split(/,|;|\\text\{\s*y\s*\}/)
        .map((s) => s.replace(/^\s*[A-Za-z](\\left\(x\\right\)|\(x\))?\s*=\s*/, ""))
        .filter((s) => s.trim());
      if (parts.length === 2) {
        const okQ = compareSteps(q, parts[0]!).status === "equivalent";
        const okR = compareSteps(rem, parts[1]!).status === "equivalent";
        if (okQ && okR) return { status: "solved", reason: "¡Cociente y resto correctos!" };
        return { status: "wrong", reason: okQ ? "El cociente está bien, revisá el resto" : "Revisá el cociente" };
      }
      if (rem === "0" && parts.length === 1 && compareSteps(q, parts[0]!).status === "equivalent")
        return { status: "solved", reason: "¡Cociente correcto, resto 0!" };
      return { status: "unknown", reason: "Escribí C = ..., R = ..." };
    }
  }
}

export function exerciseAnswerTeX(ex: Exercise): string {
  if (ex.kind === "solve" && ex.answer[0] === "none") return "\\text{sin solución}";
  if (ex.kind === "solve" && ex.answer[0] === "all") return "\\text{infinitas soluciones}";
  if (ex.kind === "solve") return ex.answer.map((a) => `x=${toTeX(a)}`).join(",\\ ");
  if (ex.kind === "divide") return `C=${ex.answer[0]},\\ R=${ex.answer[1]}`;
  return ex.answer[0]!;
}
