// Fixed exercise catalog: the "Trabajo Práctico 2: Ecuaciones y Factorización" (UNRN, Matemática 2) worksheet,
// split into sections for the exercises modal. Word problems (ej. 2) are not loaded: they have no starting equation.
import { solveEquation } from "./cas";
import { polyTeX } from "./exercises";
import type { Exercise, ExerciseKind, Topic } from "./types";

export type WorksheetId = "tp2" | "tp3";

export interface CatalogItem {
  /** Worksheet this exercise belongs to. */
  ws: WorksheetId;
  /** Stable id inside the worksheet, e.g. "1a" (the same id can exist in another worksheet). */
  id: string;
  kind: ExerciseKind;
  topic: Topic;
  /** Statement shown on the card (plain text). */
  prompt: string;
  latex: string;
  /** Expected answer; solve exercises derive it from the CAS when absent. */
  answer?: string[];
}

export interface CatalogGroup {
  /** Worksheet number and title, e.g. "5.- Factor común". */
  title: string;
  items: CatalogItem[];
}

export interface Worksheet {
  id: WorksheetId;
  /** Short tab label, e.g. "TP 2". */
  tab: string;
  title: string;
  sections: CatalogSection[];
}

export interface CatalogSection {
  id: string;
  title: string;
  hint: string;
  groups: CatalogGroup[];
}

type Row = [id: string, latex: string, answer?: string | string[], note?: string];

function group(ws: WorksheetId, num: number, title: string, kind: ExerciseKind, topic: Topic, prompt: string, rows: Row[]): CatalogGroup {
  return {
    title: `${num}.- ${title}`,
    items: rows.map(([id, latex, answer, note]) => ({
      ws,
      id: `${num}${id}`,
      kind,
      topic,
      prompt: `Ej. ${num}${id} — ${prompt}${note ? ` ${note}` : ""}`,
      latex,
      answer: answer === undefined ? undefined : Array.isArray(answer) ? answer : [answer],
    })),
  };
}

const TP2_SECTIONS: CatalogSection[] = [
  {
    id: "ecuaciones",
    title: "Ecuaciones",
    hint: "Lineales, con fracciones y decimales",
    groups: [
      group("tp2", 1, "Ecuaciones lineales", "solve", "lineal", "Resolvé y verificá (puede tener una solución, ninguna o infinitas)", [
        ["a", "3-2(5-4x)=6(2x-1)-5"],
        ["b", "8-(x-4)=8x-3(1-2x)(-2)"],
        ["c", "4x-7=\\left(0.5x-7\\div8\\right)\\div0.125"],
        ["d", "-2(0.2x-0.6)(-0.5)-1=(x-3)\\div5"],
        ["e", "1-(3-2\\cdot x)=11-\\frac{4\\cdot x-2}{6}"],
        ["f", "3\\cdot x-\\frac{8-5\\cdot x}{4}=10-6\\cdot(2-x)"],
        ["g", "5-\\frac{x+4}{0.5}=\\frac{4x+6}{-2}"],
        ["h", "\\frac{2+x}{3}+3(x-5)=\\frac{x-4}{2}-1"],
        ["i", "\\frac{3x-5}{x-1}=\\frac{3x-2}{x+2}"],
        // 1,6̂ = 5/3 · 0,3̂ = 1/3 · 0,1̂ = 1/9
        ["j", "\\frac{5}{3}-\\frac{2(5-3x)}{\\frac{1}{3}}=\\frac{2x-1}{\\frac{1}{9}}+1"],
      ]),
    ],
  },
  {
    id: "notables",
    title: "Productos notables",
    hint: "Verificar y desarrollar",
    groups: [
      group("tp2", 3, "Verificar afirmaciones", "expand", "operaciones", "Verificá con la distributiva (desarrollá el lado izquierdo)", [
        ["a", "(a+b)^2", "a^2+2ab+b^2", "→ debe dar a² + 2ab + b²"],
        ["b", "(a-b)^2", "a^2-2ab+b^2", "→ debe dar a² − 2ab + b²"],
        ["c", "(-a-b)^2", "a^2+2ab+b^2", "→ debe dar a² + 2ab + b²"],
        ["d", "(-a+b)^2", "a^2-2ab+b^2", "→ debe dar a² − 2ab + b²"],
        ["e", "(a+b)(a-b)", "a^2-b^2", "→ debe dar a² − b²"],
        ["f", "(-a+b)(-a-b)", "a^2-b^2", "→ debe dar a² − b²"],
      ]),
      group("tp2", 4, "Desarrollar", "expand", "operaciones", "Desarrollá", [
        ["a", "(x+9)^2", "x^2+18x+81"],
        ["b", "(x-7)^2", "x^2-14x+49"],
        ["c", "(-x+8)^2", "x^2-16x+64"],
        ["d", "(-x-6)^2", "x^2+12x+36"],
        ["e", "(3x+5)^2", "9x^2+30x+25"],
        ["f", "(3-2z)^2", "9-12z+4z^2"],
        ["g", "(5x^2-4y^3)^2", "25x^4-40x^2y^3+16y^6"],
        ["h", "(x-11)(x+11)", "x^2-121"],
        ["i", "(2x-5)(2x+5)", "4x^2-25"],
        ["j", "(x^3-4)(x^3+4)", "x^6-16"],
        ["k", "(2\\sqrt{x}-5)(2\\sqrt{x}+5)", "4x-25"],
        ["l", "\\left(\\sqrt{7}+\\frac{1}{x}\\right)\\left(\\sqrt{7}-\\frac{1}{x}\\right)", "7-\\frac{1}{x^2}"],
      ]),
    ],
  },
  {
    id: "factorizacion",
    title: "Factorización",
    hint: "Factor común, cuadrados, trinomios, grupos",
    groups: [
      group("tp2", 5, "Factor común", "factor", "factorizar", "Factorizá (factor común)", [
        ["a", "35xb-7x", "7x(5b-1)"],
        ["b", "3xz-6z^2+12zy", "3z(x-2z+4y)"],
        ["c", "2wx-4yw+6wxz", "2w(x-2y+3xz)"],
        ["d", "10x^3-2x^2", "2x^2(5x-1)"],
      ]),
      group("tp2", 6, "Diferencia de cuadrados", "factor", "factorizar", "Factorizá (diferencia de cuadrados)", [
        ["a", "x^2-36", "(x-6)(x+6)"],
        ["b", "x^2-7", "(x-\\sqrt{7})(x+\\sqrt{7})"],
        ["c", "100-z^2", "(10-z)(10+z)"],
        ["d", "4x^2-y^2", "(2x-y)(2x+y)"],
        ["e", "25y^2-\\frac{1}{9}", "\\left(5y-\\frac{1}{3}\\right)\\left(5y+\\frac{1}{3}\\right)"],
      ]),
      group("tp2", 7, "Trinomio cuadrado perfecto", "factor", "factorizar", "Factorizá (trinomio cuadrado perfecto)", [
        ["a", "x^2+6x+9", "(x+3)^2"],
        ["b", "x^2-14x+49", "(x-7)^2"],
        ["c", "64-48y+9y^2", "(8-3y)^2"],
        ["d", "4x^2+28x+49", "(2x+7)^2"],
      ]),
      group("tp2", 8, "Factor común por grupos", "factor", "factorizar", "Factorizá (factor común por grupos)", [
        ["a", "x^3+2x^2-9x-18", "(x+2)(x-3)(x+3)"],
        ["b", "2x^5-5x^4-32x+80", "(2x-5)(x-2)(x+2)(x^2+4)"],
        ["c", "-x^3+5x^2+4x-20", "-(x-5)(x-2)(x+2)"],
      ]),
      group("tp2", 9, "Factorizar lo más posible", "factor", "factorizar", "Factorizá lo más posible", [
        ["a", "16xy-12xz-4xw", "4x(4y-3z-w)"],
        ["b", "9x^2-\\frac{25}{4y^6}", "\\left(3x-\\frac{5}{2y^3}\\right)\\left(3x+\\frac{5}{2y^3}\\right)"],
        ["c", "9x^2-24xy+16y^2", "(3x-4y)^2"],
        ["d", "81-x^4", "(3-x)(3+x)(9+x^2)"],
        ["e", "\\frac{8}{15}xy^2+\\frac{14}{27}x^2y^2-\\frac{10}{9}x^2y", "\\frac{2xy}{135}\\left(36y+35xy-75x\\right)"],
        ["f", "2x^2-8xy+8y^2", "2(x-2y)^2"],
        ["g", "\\frac{0.04}{x^2}-0.25", "\\left(\\frac{0.2}{x}-0.5\\right)\\left(\\frac{0.2}{x}+0.5\\right)"],
        ["h", "z(z+3)-5(z+3)", "(z+3)(z-5)"],
        ["i", "(y-5)^2-7(y-5)", "(y-5)(y-12)"],
        ["j", "\\frac{1}{4}x^2-4xy+16y^2", "\\left(\\frac{1}{2}x-4y\\right)^2"],
      ]),
      group("tp2", 12, "Factorizar cuadráticas", "factor", "factorizar", "Factorizá la expresión cuadrática", [
        ["a", "x^2-2x-15", "(x-5)(x+3)"],
        ["b", "x^2-9x+18", "(x-3)(x-6)"],
        ["c", "2x^2-10x+12", "2(x-2)(x-3)"],
        ["d", "-x^2-6x+7", "-(x+7)(x-1)"],
        ["e", "x^2+6x+8", "(x+2)(x+4)"],
        ["f", "x^2+4x-5", "(x+5)(x-1)"],
        ["g", "-2x^2-x+21", "-(2x+7)(x-3)"],
        ["h", "6x^2-5x-6", "(2x-3)(3x+2)"],
      ]),
    ],
  },
  {
    id: "cuadraticas",
    title: "Cuadráticas",
    hint: "Ecuaciones de segundo grado y con x en el denominador",
    groups: [
      group("tp2", 11, "Ecuaciones de segundo grado", "solve", "cuadratica", "Resolvé, si es posible (no siempre hace falta la resolvente)", [
        ["a", "x^2+3x-10=0"],
        ["b", "x^2-3x=54"],
        ["c", "2x^2-15=-7x"],
        ["d", "18-2x^2=0"],
        ["e", "x^2=9x"],
        ["f", "x^2-2x=-3", "none"],
      ]),
      group("tp2", 13, "Ecuaciones con dos soluciones", "solve", "cuadratica", "Resolvé (cada una tiene dos soluciones)", [
        ["a", "\\frac{4x}{x+2}-\\frac{10}{3}=\\frac{2}{x-2}"],
        ["b", "1-\\frac{1-2x}{3x+2}=\\frac{7}{x+4}"],
        ["c", "5x+3=\\frac{10}{x}+4x"],
        ["d", "\\frac{7x}{4-3x}=-2x"],
      ]),
    ],
  },
  {
    id: "simplificar",
    title: "Simplificar",
    hint: "Expresiones y fracciones algebraicas",
    groups: [
      group("tp2", 10, "Simplificar expresiones", "simplify", "operaciones", "Simplificá la expresión", [
        ["a", "(a-b)(b-a)", "-(a-b)^2"],
        ["b", "(a-b)^2-(b-a)^2", "0"],
        ["c", "(a+b)^2-(a-b)^2", "4ab"],
        ["d", "\\frac{(a+b)^2(a-b)^2}{a^2-b^2}", "(a+b)(a-b)"],
        ["e", "\\frac{(a+b)(b-a)}{(a-b)(-b-a)}", "1"],
      ]),
      group("tp2", 14, "Simplificar fracciones algebraicas", "simplify", "operaciones", "Simplificá la fracción", [
        ["a", "\\frac{27-3x^2}{6x^2-36x+54}", "-\\frac{x+3}{2(x-3)}"],
        ["b", "\\frac{-48+3x^2}{16-8x+x^2}", "\\frac{3(x+4)}{x-4}"],
        ["c", "\\frac{-36+9x^2}{-18x+9x^2}", "\\frac{x+2}{x}"],
      ]),
    ],
  },
];

// ---------------------------------------------------------------- TP 3: Polinomios

/** Synthetic division by (x - a): quotient coefficients and remainder. */
function ruffini(coeffs: number[], a: number): [number[], number] {
  const row: number[] = [];
  coeffs.forEach((c, i) => row.push(i === 0 ? c : c + row[i - 1]! * a));
  return [row.slice(0, -1), row.at(-1)!];
}

/** `P(a)` written out for a polynomial given by coefficients (highest degree first; a string coefficient such as "k" is kept symbolic). */
function substituted(coeffs: (number | string)[], a: number, tail = ""): string {
  const at = a < 0 ? `\\left(${a}\\right)` : String(a);
  const n = coeffs.length - 1;
  let out = "";
  coeffs.forEach((c, i) => {
    if (c === 0) return;
    const p = n - i;
    const neg = typeof c === "number" && c < 0;
    const mag = typeof c === "number" ? String(Math.abs(c)) : c;
    const power = p === 0 ? "" : p === 1 ? `\\cdot ${at}` : `\\cdot ${at}^{${p}}`;
    const body = p === 0 ? mag : `${mag}${power}`;
    out += out ? `${neg ? "-" : "+"}${body}` : `${neg ? "-" : ""}${body}`;
  });
  return `${out}${tail}`;
}

/** Numeric value of P(a) by Horner. */
function valueAt(coeffs: number[], a: number): number {
  return coeffs.reduce((acc, c) => acc * a + c, 0);
}

/** Readable "2x³ − 7x² + kx − 20" for a prompt. */
function plainPoly(coeffs: (number | string)[]): string {
  const sup = ["", "", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸"];
  const n = coeffs.length - 1;
  let out = "";
  coeffs.forEach((c, i) => {
    if (c === 0) return;
    const p = n - i;
    const neg = typeof c === "number" && c < 0;
    const mag = typeof c === "number" ? (Math.abs(c) === 1 && p > 0 ? "" : String(Math.abs(c))) : c;
    const body = p === 0 ? (mag || "1") : `${mag}x${sup[p] ?? `^${p}`}`;
    out += out ? ` ${neg ? "−" : "+"} ${body}` : `${neg ? "−" : ""}${body}`;
  });
  return out;
}

const texPoly = (coeffs: number[]): string => polyTeX(coeffs);

// Division exercises of the worksheet: [id, dividend, divisor(a for x-a)] with coefficients highest degree first.
const DIVISIONS: [string, number[], number][] = [
  ["a", [3, -4, 5], 2],
  ["b", [2, -4, 1, -8], 3],
  ["c", [1, -7, 0, 2, -6], -1],
  ["d", [2, 0, -5, 0, 0, 9], 2],
  ["e", [3, 0, -7, 0, 8, 0, -4], 1],
  ["f", [4, -1, 0, 20, -30, 0], -2],
  ["g", [2, -7, -15, 0, 4, -20], 5],
  ["h", [8, 6, -9, 5, 7], 0],
];

const ROOT_CHECKS: [string, number[], number[]][] = [
  ["a", [2, -5, -3], [1, 2, 3]],
  ["b", [4, 0, -13, 6], [-2, 2, 0.5]],
  ["c", [1, 2, -5, -6, 0], [0, 1, -3]],
];

const K_CASES: [string, (number | string)[], number, number, string][] = [
  ["a", [2, -7, "k", -20], 5, 0, "tenga a 5 como raíz"],
  ["b", [1, -4, "k", -7, -6], 3, 0, "sea divisible por (x − 3)"],
  ["c", [1, 0, "k", -4, 0, 15], -2, -9, "tenga resto −9 al dividirlo por (x + 2)"],
  ["d", [3, -7, "k", 0, 9, 0], 1, 10, "tenga resto 10 al dividirlo por (x − 1)"],
  ["e", [7, -6, 8, "k"], 0, 0, "tenga resto 0 al dividirlo por x"],
];

const P5 = "(x^3-5x^2-2x+6)";
const Q5 = "(5x^3-3x-4)";
const OPS_PROMPT = "Dados P(x) = x³ − 5x² − 2x + 6 y Q(x) = 5x³ − 3x − 4, efectuá:";

const TP3_SECTIONS: CatalogSection[] = [
  {
    id: "operaciones",
    title: "Operaciones",
    hint: "Suma, resta y producto de polinomios",
    groups: [
      group("tp3", 5, "Suma y resta", "expand", "operaciones", OPS_PROMPT, [
        ["a", `${P5}+${Q5}`, "6x^3-5x^2-5x+2", "P + Q"],
        ["b", `${P5}-${Q5}`, "-4x^3-5x^2+x+10", "P − Q"],
        ["c", `2${Q5}-3${P5}`, "7x^3+15x^2-26", "2Q − 3P"],
        ["d", `-${P5}-${Q5}+2`, "-6x^3+5x^2+5x", "−P − Q + 2"],
        ["e", `3x^3-5-3${P5}`, "15x^2+6x-23", "3x³ − 5 − 3P"],
        ["f", `-(8-x^2)-2${Q5}`, "-10x^3+x^2+6x", "−(8 − x²) − 2Q"],
      ]),
      group("tp3", 6, "Producto", "expand", "operaciones", "Con P(x) = 4x² − 5x + 3 y Q(x) = 2x³ − 6x − 7, efectuá P(x)·Q(x)", [
        ["", "(4x^2-5x+3)(2x^3-6x-7)", "8x^5-10x^4-18x^3+2x^2+17x-21"],
      ]),
    ],
  },
  {
    id: "division",
    title: "División",
    hint: "Cociente y resto, Ruffini y teorema del resto",
    groups: [
      group("tp3", 7, "Cociente y resto", "divide", "division", "Hallá el cociente y el resto de dividir P por Q. Escribí C = ..., R = ...", [
        ["a", "\\left(3x^2-4x+5\\right)\\div\\left(x-2\\right)", ["3x+2", "9"]],
        ["b", "\\left(5x^4-2x^2+6x-7\\right)\\div\\left(x^2-2x+3\\right)", ["5x^2+10x+3", "-18x-16"]],
        ["c", "\\left(6x^4-8x^3-5x+1\\right)\\div\\left(2x^2-4\\right)", ["3x^2-4x+6", "-21x+25"]],
      ]),
      group(
        "tp3",
        8,
        "Regla de Ruffini",
        "divide",
        "division",
        "Dividí con la Regla de Ruffini e indicá si P es divisible por Q. Escribí C = ..., R = ...",
        DIVISIONS.map(([id, c, a]): Row => {
          const [quotient, rem] = ruffini(c, a);
          return [id, `\\left(${texPoly(c)}\\right)\\div\\left(${a === 0 ? "x" : polyTeX([1, -a])}\\right)`, [texPoly(quotient), String(rem)]];
        }),
      ),
      group(
        "tp3",
        9,
        "Teorema del resto",
        "simplify",
        "operaciones",
        "Verificá el teorema del resto: calculá P(a) y compará con el resto del ejercicio 8",
        DIVISIONS.map(([id, c, a]): Row => [id, substituted(c, a), String(valueAt(c, a)), `(P = ${plainPoly(c)}, a = ${a})`]),
      ),
    ],
  },
  {
    id: "raices",
    title: "Raíces",
    hint: "¿Es raíz?, forma factorizada y hallar k",
    groups: [
      group(
        "tp3",
        11,
        "¿Es raíz del polinomio?",
        "simplify",
        "operaciones",
        "Calculá P(x₀) y decidí si x₀ es raíz (raíz si da 0)",
        ROOT_CHECKS.flatMap(([id, c, roots]): Row[] =>
          roots.map((r, i): Row => [`${id}${i + 1}`, substituted(c, r), String(valueAt(c, r)), `(P = ${plainPoly(c)}, x₀ = ${r})`]),
        ),
      ),
      group("tp3", 14, "Raíces y forma factorizada", "factor", "factorizar", "Hallá todas las raíces y expresá P en forma factorizada", [
        ["a", "x^3-x^2-14x+24", "(x+4)(x-2)(x-3)", "(sabiendo que 2 es raíz)"],
        ["b", "2x^4-6x^3-26x^2+30x", "2x(x+3)(x-1)(x-5)", "(sabiendo que es divisible por x + 3)"],
        ["c", "-4x^4-x^3+12x^2+11x+2", "-(x+1)^2(x-2)(4x+1)", "(sabiendo que el resto de dividirlo por x + 1 es cero)"],
        ["d", "2x^6-3x^5-5x^4+13x^3-9x^2+2x", "x(x-1)^3(x+2)(2x-1)", "(sabiendo que P(1) = 0)"],
        ["e", "x^3+3x^2-x-3", "(x-1)(x+1)(x+3)"],
        ["f", "x^4-5x^2+4", "(x-1)(x+1)(x-2)(x+2)"],
        ["g", "3x^6+3x^5-21x^4-3x^3+18x^2", "3x^2(x-1)(x-2)(x+1)(x+3)"],
      ]),
      group(
        "tp3",
        15,
        "Hallar el valor de k",
        "solve",
        "lineal",
        "Hallá k (reemplazá x por el valor y despejá k)",
        K_CASES.map(([id, c, a, tail, what]): Row => [id, substituted(c, a, `=${tail}`), undefined, `para que P(x) = ${plainPoly(c)} ${what}`]),
      ),
    ],
  },
];

export const WORKSHEETS: Worksheet[] = [
  { id: "tp2", tab: "TP 2", title: "TP 2 · Ecuaciones y Factorización", sections: TP2_SECTIONS },
  { id: "tp3", tab: "TP 3", title: "TP 3 · Polinomios", sections: TP3_SECTIONS },
];

export function worksheet(id: WorksheetId): Worksheet {
  return WORKSHEETS.find((w) => w.id === id)!;
}

/** Unique key of an item across worksheets. */
export function itemKey(item: Pick<CatalogItem, "ws" | "id">): string {
  return `${item.ws}:${item.id}`;
}

export function catalogItems(ws?: WorksheetId): CatalogItem[] {
  return WORKSHEETS.filter((w) => !ws || w.id === ws).flatMap((w) => w.sections.flatMap((s) => s.groups.flatMap((g) => g.items)));
}

export function findCatalogItem(id: string, ws: WorksheetId = "tp2"): CatalogItem | undefined {
  return catalogItems(ws).find((i) => i.id === id);
}

let counter = 0;

/** The exercise a card needs for a catalog item; a fresh id each time so the same one can be put on the board twice. */
export function catalogExercise(item: CatalogItem): Exercise {
  let answer = item.answer;
  if (!answer) {
    const sol = solveEquation(item.latex);
    answer = sol.all ? ["all"] : sol.solutions.length ? sol.solutions : ["none"];
  }
  return {
    id: `${item.ws}-${item.id}-${Date.now().toString(36)}${(counter++).toString(36)}`,
    topic: item.topic,
    level: 1,
    kind: item.kind,
    prompt: item.prompt,
    latex: item.latex,
    answer,
  };
}

/** Items matching a search: by id ("5a"), by group title or by statement text. Empty query matches everything. */
export function searchCatalog(query: string, ws?: WorksheetId): CatalogItem[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, "");
  if (!q) return catalogItems(ws);
  const exact = catalogItems(ws).filter((i) => i.id === q);
  if (exact.length) return exact;
  const plain = (t: string) => t.toLowerCase().replace(/\\left|\\right|\\cdot|[\s{}\\]/g, "");
  return WORKSHEETS.filter((w) => !ws || w.id === ws).flatMap((w) =>
    w.sections.flatMap((sec) =>
      sec.groups.flatMap((g) => g.items.filter((i) => i.id === q || plain(i.latex).includes(q) || plain(g.title).includes(q) || plain(i.prompt).includes(q))),
    ),
  );
}

/** Whether an exercise from this catalog item is already on the board (card exercises carry the worksheet and item id in their id). */
export function onBoard(exercises: Pick<Exercise, "id">[], item: CatalogItem): boolean {
  return exercises.some((e) => e.id.startsWith(`${item.ws}-${item.id}-`));
}
