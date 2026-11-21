// Ruffini tool: pure logic (table, guided cell order, validation with hints, result, summary).
// The web widget lives in src/web/tools/ruffini.ts.
import { evaluate } from "../cas";
import { polyTeX } from "../exercises";
import { formatNumber, operand, parseNumber, polyCoeffs, powerLabel } from "../poly";

export interface RuffiniData {
  /** Dividend as LaTeX (shown on the tool). */
  dividend: string;
  /** Expected coefficients, descending and complete. */
  coeffs: number[];
  /** Root a of the divisor x − a; chosen by the learner when not fixed. */
  root?: number;
  fixedRoot: boolean;
  /** Validated (locked) cells. */
  entries: Record<string, number>;
  /** Last rejected attempt, shown with its hint. */
  wrong?: { cell: string; value: string; hint: string };
  /** Exercise card that receives the result line. */
  card?: string;
  /** Factor already taken out (e.g. "x" after Gauss factored out x), written in front of the factored form. */
  prefix?: string;
}

export function startRuffini(dividend: string, coeffs: number[], root?: number): RuffiniData {
  return { dividend, coeffs, ...(root === undefined ? {} : { root }), fixedRoot: root !== undefined, entries: {} };
}

/** `\left(P\right)\div\left(x-a\right)` → dividend, coefficients and root; null when the divisor is not x − a. */
export function parseDivision(latex: string): { dividend: string; coeffs: number[]; root: number } | null {
  const parts = latex.split("\\div");
  if (parts.length !== 2) return null;
  const strip = (s: string) => s.trim().replace(/^\\left\(/, "").replace(/\\right\)$/, "").replace(/^\((.*)\)$/, "$1").trim();
  const dividend = strip(parts[0]!);
  const divisor = strip(parts[1]!);
  try {
    const d0 = evaluate(divisor, { x: 0 });
    const d1 = evaluate(divisor, { x: 1 }) - d0;
    if (Math.abs(d1 - 1) > 1e-9 || Math.abs(evaluate(divisor, { x: 2 }) - (d0 + 2)) > 1e-9) return null;
    return { dividend, coeffs: polyCoeffs(dividend), root: d0 === 0 ? 0 : -d0 };
  } catch {
    return null;
  }
}

export function expectedTable(coeffs: number[], root: number) {
  const s: number[] = [];
  const p: (number | null)[] = [null];
  coeffs.forEach((c, i) => {
    if (i === 0) return s.push(c);
    const prod = s[i - 1]! * root;
    p.push(prod);
    s.push(c + prod);
  });
  return { c: [...coeffs], p, s };
}

/** Coefficient row, root, then per column: bring down / multiply / add. */
export function cellOrder(degree: number): string[] {
  const out = Array.from({ length: degree + 1 }, (_, i) => `c${i}`);
  out.push("r", "s0");
  for (let i = 1; i <= degree; i++) out.push(`p${i}`, `s${i}`);
  return out;
}

const degreeOf = (d: RuffiniData) => d.coeffs.length - 1;

export function nextCell(d: RuffiniData): string | null {
  return cellOrder(degreeOf(d)).find((c) => !(c in d.entries)) ?? null;
}

export function divisorText(root: number | undefined): string {
  if (root === undefined) return "(x−?)";
  return root < 0 ? `(x+${formatNumber(-root)})` : `(x−${formatNumber(root)})`;
}

const minus = (v: number) => (v < 0 ? `−${formatNumber(-v)}` : formatNumber(v));

export function cellLabel(d: RuffiniData, cell: string): string {
  const i = Number(cell.slice(1));
  if (cell === "r") return "raíz";
  if (cell[0] === "c") {
    const p = degreeOf(d) - i;
    return p === 0 ? "término independiente" : `coeficiente de ${powerLabel(p)}`;
  }
  if (cell === "s0") return "bajar el primero";
  return cell[0] === "p" ? `producto columna ${i + 1}` : `suma columna ${i + 1}`;
}

/** Expected value of a cell (null for a free root). */
export function expectedValue(d: RuffiniData, cell: string): number | null {
  if (cell === "r") return d.fixedRoot ? d.root! : null;
  if (cell[0] === "c") return d.coeffs[Number(cell.slice(1))]!;
  if (d.root === undefined) return null;
  const t = expectedTable(d.coeffs, d.root);
  const i = Number(cell.slice(1));
  return cell[0] === "p" ? t.p[i]! : t.s[i]!;
}

const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;

function hintFor(d: RuffiniData, cell: string, v: number, want: number): string {
  const i = Number(cell.slice(1));
  if (cell[0] === "c") {
    const p = degreeOf(d) - i;
    const what = p === 0 ? "el término independiente" : `el coeficiente de ${powerLabel(p)}`;
    if (want === 0) return `Falta el término de ${powerLabel(p)}: completá con 0.`;
    if (same(v, -want)) return `Revisá el signo de ${what}.`;
    return `Ese no es ${what}.`;
  }
  if (cell === "r") {
    if (same(v, -want)) return `La raíz es el número que anula el divisor: en ${divisorText(want)} va ${minus(want)}.`;
    return `La raíz sale del divisor ${divisorText(want)}: ¿qué valor de x lo hace 0?`;
  }
  const t = expectedTable(d.coeffs, d.root!);
  if (cell === "s0") return `El primer coeficiente se baja igual: ${formatNumber(t.c[0]!)}.`;
  if (cell[0] === "p") {
    const prev = t.s[i - 1]!;
    const how = `${operand(prev)} · ${operand(d.root!)}`;
    if (same(v, prev + d.root!)) return `Es un producto, no una suma: multiplicá ${how}.`;
    if (same(v, prev)) return `Multiplicá por la raíz: ${how}.`;
    return `Multiplicá ${how}.`;
  }
  const sum = `${operand(t.c[i]!)} + ${operand(t.p[i]!)}`;
  if (same(v, t.c[i]! - t.p[i]!)) return `Se suma la columna: ${sum}.`;
  return `Sumá la columna: ${sum}.`;
}

/** Validate one cell; correct values lock, wrong ones are kept with a hint. */
export function applyCell(d: RuffiniData, cell: string, raw: string): { ok: boolean; hint?: string; data: RuffiniData } {
  if (nextCell(d) !== cell) return { ok: false, hint: "Primero completá la celda marcada.", data: d };
  const v = parseNumber(raw);
  if (v === null) {
    const hint = "Escribí un número (por ejemplo -3 o 1/2).";
    return { ok: false, hint, data: { ...d, wrong: { cell, value: raw, hint } } };
  }
  const want = expectedValue(d, cell);
  if (want !== null && !same(v, want)) {
    const hint = hintFor(d, cell, v, want);
    return { ok: false, hint, data: { ...d, wrong: { cell, value: raw, hint } } };
  }
  const { wrong: _, ...rest } = d;
  const data: RuffiniData = { ...rest, entries: { ...d.entries, [cell]: v } };
  if (cell === "r" && !d.fixedRoot) data.root = v;
  return { ok: true, data };
}

export function rufResult(d: RuffiniData): { quotient: string; remainder: string; latex: string } | null {
  if (nextCell(d) !== null || d.root === undefined) return null;
  const s = expectedTable(d.coeffs, d.root).s;
  const quotient = polyTeX(s.slice(0, -1));
  const remainder = formatNumber(s.at(-1)!);
  return { quotient, remainder, latex: `C=${quotient},\\ R=${remainder}` };
}

/** `prefix·(x − r)·C(x)` when the division is exact (a factoring step); null otherwise. */
export function rufFactorLatex(d: RuffiniData): string | null {
  const res = rufResult(d);
  if (!res || res.remainder !== "0") return null;
  const r = d.root!;
  const lin = r === 0 ? "x" : r < 0 ? `x+${formatNumber(-r)}` : `x-${formatNumber(r)}`;
  return `${d.prefix ?? ""}\\left(${lin}\\right)\\left(${res.quotient}\\right)`;
}

/** One line for `gebra board`. */
export function summarize(data: Record<string, unknown>): string {
  const d = data as unknown as RuffiniData;
  if (!Array.isArray(d.coeffs) || !d.entries) return "(sin datos)";
  const head = `${d.dividend} ÷ ${divisorText(d.root)}`;
  const res = rufResult(d);
  if (res) return `${head}: completo · C=${res.quotient}, R=${res.remainder}`;
  const total = cellOrder(degreeOf(d)).length;
  const next = nextCell(d)!;
  const wrong = d.wrong ? ` · último error en ${d.wrong.cell}: "${d.wrong.value}"` : "";
  return `${head}: ${Object.keys(d.entries).length}/${total} celdas · sigue ${next} (${cellLabel(d, next)})${wrong}`;
}
