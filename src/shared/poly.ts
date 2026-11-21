// Small polynomial helpers shared by the learning tools: coefficients from LaTeX and learner number input.
import { evaluate, expand } from "./cas";

/** Descending, complete coefficients of a polynomial in x (an equation becomes lhs − rhs). */
export function polyCoeffs(latex: string): number[] {
  const sides = latex.split("=");
  const expr = sides.length === 2 ? `\\left(${sides[0]}\\right)-\\left(${sides[1]}\\right)` : latex;
  const expanded = expand(expr);
  let degree = 0;
  for (const m of expanded.matchAll(/x(\^\{?(\d+)\}?)?/g)) degree = Math.max(degree, m[2] ? Number(m[2]) : 1);
  // sample n+1 points and solve the Vandermonde system (small degrees, exact enough after rounding)
  const n = degree;
  const rows = Array.from({ length: n + 1 }, (_, k) => {
    const x = k - Math.floor(n / 2);
    return [...Array.from({ length: n + 1 }, (_, j) => x ** (n - j)), evaluate(expr, { x })];
  });
  for (let col = 0; col <= n; col++) {
    const piv = rows.slice(col).reduce((best, r, i) => (Math.abs(r[col]!) > Math.abs(rows[best]![col]!) ? col + i : best), col);
    [rows[col], rows[piv]] = [rows[piv]!, rows[col]!];
    for (let r = 0; r <= n; r++) {
      if (r === col) continue;
      const f = rows[r]![col]! / rows[col]![col]!;
      for (let c = col; c <= n + 1; c++) rows[r]![c]! -= f * rows[col]![c]!;
    }
  }
  return rows.map((r, i) => clean(r[n + 1]! / r[i]!));
}

function clean(v: number): number {
  const r = Math.round(v);
  if (Math.abs(v - r) < 1e-7) return r === 0 ? 0 : r;
  return Math.round(v * 1e9) / 1e9;
}

/** Learner input → number: integers, decimals (comma or dot), a/b, \frac{a}{b}; null when not a number. */
export function parseNumber(input: string): number | null {
  let s = input.trim().replace(/[−–]/g, "-").replace(/\s+/g, "").replace(",", ".");
  if (!s) return null;
  let sign = 1;
  if (s.startsWith("-")) {
    sign = -1;
    s = s.slice(1);
  }
  const frac = s.match(/^\\[dt]?frac\{(-?[\d.]+)\}\{(-?[\d.]+)\}$/) ?? s.match(/^\(?(-?[\d.]+)\)?\/\(?(-?[\d.]+)\)?$/);
  if (frac) {
    const d = Number(frac[2]);
    if (!d) return null;
    const v = Number(frac[1]) / d;
    return Number.isFinite(v) ? sign * v : null;
  }
  if (!/^\d*\.?\d+$/.test(s)) return null;
  return sign * Number(s);
}

/** Number → "3", "-3/2", "1/3" (or a short decimal). */
export function formatNumber(v: number): string {
  if (Number.isInteger(v)) return String(v);
  for (let d = 2; d <= 100; d++) {
    const n = Math.round(v * d);
    if (Math.abs(n / d - v) < 1e-9) return `${n}/${d}`;
  }
  return String(Math.round(v * 1000) / 1000);
}

/** Same as formatNumber with a typographic minus, wrapped in parentheses when negative (for "a · (−2)"). */
export function operand(v: number): string {
  return v < 0 ? `(−${formatNumber(-v)})` : formatNumber(v);
}

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
/** "x²", "x", "término independiente"-friendly power label. */
export function powerLabel(p: number): string {
  if (p === 0) return "";
  if (p === 1) return "x";
  return `x${String(p).split("").map((d) => SUP[Number(d)]).join("")}`;
}
