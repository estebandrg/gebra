// Gauss tool: rational-root candidates ±p/q, evaluation P(r) and summary.
// The web widget lives in src/web/tools/gauss.ts.
import { formatNumber } from "../poly";

export interface GaussData {
  /** Polynomial as LaTeX. */
  poly: string;
  /** Descending coefficients. */
  coeffs: number[];
  /** Candidate (formatted) → P(candidate). */
  tried: Record<string, number>;
  card?: string;
}

export function divisors(n: number): number[] {
  const a = Math.abs(n);
  const out: number[] = [];
  for (let d = 1; d <= a; d++) if (a % d === 0) out.push(d);
  return out;
}

/** Candidates ±p/q for integer coefficients (after factoring out x^k when the constant term is 0). */
export function gaussCandidates(coeffs: number[]) {
  if (!coeffs.every(Number.isInteger)) return null;
  let factorX = 0;
  let reduced = [...coeffs];
  while (reduced.length > 1 && reduced.at(-1) === 0) {
    reduced = reduced.slice(0, -1);
    factorX++;
  }
  const p = divisors(reduced.at(-1)!);
  const q = divisors(reduced[0]!);
  const set = new Map<string, number>();
  for (const a of p) for (const b of q) for (const s of [1, -1]) set.set(formatNumber((s * a) / b), (s * a) / b);
  const candidates = [...set.values()].sort((x, y) => x - y);
  return { factorX, reduced, p, q, candidates };
}

/** Horner evaluation, rounded so that exact roots give exactly 0. */
export function evalPoly(coeffs: number[], r: number): number {
  const v = coeffs.reduce((acc, c) => acc * r + c, 0);
  const rounded = Math.round(v * 1e9) / 1e9;
  return rounded === 0 ? 0 : rounded;
}

export function startGauss(poly: string, coeffs: number[]): GaussData {
  return { poly, coeffs, tried: {} };
}

export function tryCandidate(d: GaussData, r: number): GaussData {
  const g = gaussCandidates(d.coeffs);
  const value = evalPoly(g?.reduced ?? d.coeffs, r);
  return { ...d, tried: { ...d.tried, [formatNumber(r)]: value } };
}

const fracValue = (s: string) => (s.includes("/") ? Number(s.split("/")[0]) / Number(s.split("/")[1]) : Number(s));

/** One line for `gebra board`. */
export function summarize(data: Record<string, unknown>): string {
  const d = data as unknown as GaussData;
  if (!Array.isArray(d.coeffs) || !d.tried) return "(sin datos)";
  const g = gaussCandidates(d.coeffs);
  const head = `P(x)=${d.poly}${g?.factorX ? ` (factor común x^${g.factorX})` : ""}`;
  if (!g) return `${head} · coeficientes no enteros: Gauss no aplica`;
  const cands = g.candidates.map(formatNumber).join(", ");
  // sorted by value: object keys that look like integers would otherwise come first
  const tried = Object.entries(d.tried).sort(([a], [b]) => fracValue(a) - fracValue(b));
  if (!tried.length) return `${head} · candidatos: ${cands} · sin probar`;
  const roots = tried.filter(([, v]) => v === 0).map(([r]) => r);
  return `${head} · candidatos: ${cands} · probados: ${tried.map(([r, v]) => `P(${r})=${formatNumber(v)}`).join(", ")}${roots.length ? ` · raíces: ${roots.join(", ")}` : ""}`;
}
