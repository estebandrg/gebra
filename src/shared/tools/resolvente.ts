// Resolvente tool: guided quadratic formula (a, b, c → Δ → nature → roots) with hints.
// The web widget lives in src/web/tools/resolvente.ts.
import { evaluate } from "../cas";
import { formatNumber, parseNumber, polyCoeffs } from "../poly";

export type Nature = "dos" | "doble" | "ninguna";
export const STEPS = ["a", "b", "c", "delta", "nature", "x1", "x2"] as const;
export type Step = (typeof STEPS)[number];

export interface ResolventeData {
  /** The equation as written in the exercise. */
  eq: string;
  /** Expected [a, b, c] of ax² + bx + c = 0 (everything moved to the left). */
  coeffs: [number, number, number];
  /** 1, or −1 when the learner chose to multiply the whole equation by −1 (decided by their a). */
  sign?: 1 | -1;
  /** Validated numeric answers (nature as index 0/1/2 of dos/doble/ninguna). */
  entries: Partial<Record<Step, number>>;
  /** What the learner typed for the roots (used to write the result line). */
  raw: Partial<Record<"x1" | "x2", string>>;
  wrong?: { step: Step; value: string; hint: string };
  card?: string;
}

const NATURES: Nature[] = ["dos", "doble", "ninguna"];
const same = (a: number, b: number) => Math.abs(a - b) < 1e-7;

export function startResolvente(eq: string): ResolventeData {
  const c = polyCoeffs(eq.includes("=") ? eq : `${eq}=0`);
  const [a, b, k] = c.length === 3 ? c : [0, ...c.slice(-2)].slice(-3);
  return { eq, coeffs: [a ?? 0, b ?? 0, k ?? 0], entries: {}, raw: {} };
}

function signed(d: ResolventeData): [number, number, number] {
  const s = d.sign ?? 1;
  return [d.coeffs[0] * s, d.coeffs[1] * s, d.coeffs[2] * s];
}

const discriminant = (d: ResolventeData) => {
  const [a, b, c] = d.coeffs;
  return b * b - 4 * a * c;
};

function natureOf(d: ResolventeData): Nature {
  const D = discriminant(d);
  return D > 1e-9 ? "dos" : D < -1e-9 ? "ninguna" : "doble";
}

function roots(d: ResolventeData): number[] {
  const [a, b] = d.coeffs;
  const D = discriminant(d);
  if (D < -1e-9) return [];
  if (Math.abs(D) <= 1e-9) return [-b / (2 * a)];
  return [(-b - Math.sqrt(D)) / (2 * a), (-b + Math.sqrt(D)) / (2 * a)];
}

/** Steps still to answer, in order (x2 only when there are two roots). */
export function nextStep(d: ResolventeData): Step | null {
  for (const s of STEPS) {
    if (s in d.entries) continue;
    if ((s === "x1" || s === "x2") && d.entries.nature !== undefined && NATURES[d.entries.nature] === "ninguna") return null;
    if (s === "x2" && d.entries.nature !== undefined && NATURES[d.entries.nature] === "doble") return null;
    return s;
  }
  return null;
}

/** Number typed by the learner: 3, -1/2, \frac{-1}{2}, (2+sqrt(8))/2, √8 … */
export function valueOf(raw: string): number | null {
  const n = parseNumber(raw);
  if (n !== null) return n;
  const tex = toTeX(raw);
  if (!tex || /[a-wyz]/i.test(tex.replace(/\\(sqrt|frac|left|right|cdot)/g, ""))) return null;
  try {
    const v = evaluate(tex, {});
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

function toTeX(raw: string): string {
  return raw
    .trim()
    .replace(/[−–]/g, "-")
    .replace(/sqrt\s*\(([^()]+)\)/g, "\\sqrt{$1}")
    .replace(/√\s*\(([^()]+)\)/g, "\\sqrt{$1}")
    .replace(/√\s*(\d+(?:\.\d+)?)/g, "\\sqrt{$1}");
}

function hintFor(d: ResolventeData, step: Step, v: number, raw: string): string {
  const [a, b, c] = signed(d);
  switch (step) {
    case "a":
      return "a es el coeficiente de x² con todo pasado al primer miembro (… = 0).";
    case "b":
    case "c": {
      const want = step === "b" ? b : c;
      if (want === 0) return step === "b" ? "No hay término en x: b = 0." : "No hay término independiente: c = 0.";
      if (same(v, -want)) return `Revisá el signo de ${step}: al pasar un término al otro miembro cambia de signo.`;
      return step === "b" ? "b es el coeficiente de x (con su signo)." : "c es el término independiente (con su signo).";
    }
    case "delta": {
      if (a * c !== 0 && same(v, b * b + 4 * a * c)) return "Es b² − 4ac: cuidado con el signo de 4ac.";
      if (b !== 0 && same(v, -b * b - 4 * a * c)) return `(${b < 0 ? `−${-b}` : b})² es positivo: el cuadrado de un número negativo da positivo.`;
      if (same(v, b * b)) return "Te faltó restar 4·a·c.";
      return "Δ = b² − 4·a·c: reemplazá con cuidado.";
    }
    case "nature":
      return "Si Δ > 0 hay dos raíces reales distintas; si Δ = 0, una doble; si Δ < 0, ninguna real.";
    default: {
      const D = discriminant(d);
      const r = Math.sqrt(Math.max(0, D));
      if (step === "x2" && d.entries.x1 !== undefined && same(v, d.entries.x1)) return "Esa ya la encontraste: la otra usa el otro signo del ±.";
      if ([(b + r) / (2 * a), (b - r) / (2 * a)].some((x) => same(v, x))) return "Arranca con −b: cambiale el signo a b.";
      if (a !== 1 && a !== 0.5 && [(-b + r) / 2, (-b - r) / 2, -b + r, -b - r].some((x) => same(v, x))) return `Dividí por 2a = ${formatNumber(2 * a)}.`;
      if ([-b / (2 * a) + r, -b / (2 * a) - r].some((x) => same(v, x))) return "Dividí todo el numerador por 2a, no solo −b.";
      void raw;
      return "Usá x = (−b ± √Δ) / 2a.";
    }
  }
}

/** Validate one step; correct answers lock, wrong ones keep the hint. */
export function applyStep(d: ResolventeData, step: string, raw: string): { ok: boolean; hint?: string; data: ResolventeData } {
  if (nextStep(d) !== step) return { ok: false, hint: "Primero completá el casillero marcado.", data: d };
  const s = step as Step;
  const reject = (hint: string) => ({ ok: false, hint, data: { ...d, wrong: { step: s, value: raw, hint } } });
  let v: number | null;
  if (s === "nature") {
    const i = NATURES.indexOf(raw as Nature);
    if (i < 0) return reject("Elegí una opción.");
    if (NATURES[i] !== natureOf(d)) return reject(hintFor(d, s, i, raw));
    v = i;
  } else {
    v = s === "x1" || s === "x2" ? valueOf(raw) : parseNumber(raw);
    if (v === null) return reject("Escribí un número (por ejemplo -3, 1/2 o (1+sqrt(5))/2).");
    if (s === "a") {
      const a = d.coeffs[0];
      if (!same(v, a) && !same(v, -a)) return reject(hintFor(d, s, v, raw));
    } else {
      const [, b, c] = signed(d);
      const ok =
        s === "b" ? same(v, b) : s === "c" ? same(v, c) : s === "delta" ? same(v, discriminant(d)) : roots(d).some((x) => same(v!, x));
      const dupe = s === "x2" && d.entries.x1 !== undefined && same(v, d.entries.x1);
      if (!ok || dupe) return reject(hintFor(d, s, v, raw));
    }
  }
  const { wrong: _, ...rest } = d;
  const data: ResolventeData = { ...rest, entries: { ...d.entries, [s]: v }, raw: { ...d.raw } };
  if (s === "a") data.sign = same(v, d.coeffs[0]) ? 1 : -1;
  if (s === "x1" || s === "x2") data.raw[s] = raw;
  return { ok: true, data };
}

function rootTeX(v: number, raw: string | undefined): string {
  const f = formatNumber(v);
  if (/^-?\d+$/.test(f)) return f;
  const m = f.match(/^(-?)(\d+)\/(\d+)$/);
  if (m) return `${m[1]}\\frac{${m[2]}}{${m[3]}}`;
  return raw ? toTeX(raw) : f;
}

/** Result line for the card (`x=…,\ x=…`), null until the roots are found or when there are none. */
export function resolventeResult(d: ResolventeData): string | null {
  if (nextStep(d) !== null || d.entries.x1 === undefined) return null;
  const xs = [rootTeX(d.entries.x1, d.raw.x1)];
  if (d.entries.x2 !== undefined) xs.push(rootTeX(d.entries.x2, d.raw.x2));
  return xs.map((x) => `x=${x}`).join(",\\ ");
}

/** One line for `gebra board`. */
export function summarize(data: Record<string, unknown>): string {
  const d = data as unknown as ResolventeData;
  if (!Array.isArray(d.coeffs) || !d.entries) return "(sin datos)";
  const e = d.entries;
  const parts = [d.eq];
  const abc = (["a", "b", "c"] as const).filter((k) => e[k] !== undefined).map((k) => `${k}=${formatNumber(e[k]!)}`);
  if (abc.length) parts.push(abc.join(" "));
  if (e.delta !== undefined) parts.push(`Δ=${formatNumber(e.delta)}`);
  if (e.nature !== undefined) parts.push(["dos raíces", "raíz doble", "sin raíces reales"][e.nature]!);
  if (e.x1 !== undefined) parts.push(`x₁=${formatNumber(e.x1)}`);
  if (e.x2 !== undefined) parts.push(`x₂=${formatNumber(e.x2)}`);
  const next = nextStep(d);
  if (next) parts.push(`sigue: ${next === "delta" ? "Δ" : next}`);
  return parts.join(" · ");
}
