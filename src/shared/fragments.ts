// Fragments of an equation: the learner marks part of a rendered line (e.g. the numerator, an exponent, a term) and
// the agent receives the complete equation plus exactly what was marked, with where it sits (numerador, lado izquierdo…).
// KaTeX gives the source position of every atom, so each atom can be wrapped (\htmlData) to hit-test it in the DOM,
// and a selection of atoms is turned back into balanced LaTeX slices of the original source.
import katex from "katex";
import { colorName, KIND, notesFor, type Scene, type SceneElement } from "./zone";

export interface FragmentPart {
  /** Balanced LaTeX slice of the original equation. */
  latex: string;
  start: number;
  end: number;
  /** Where it sits: "numerador", "exponente", "lado izquierdo de la igualdad"… */
  where: string[];
}

export interface FragmentModel {
  latex: string;
  /** Number of selectable atoms. */
  leaves: number;
  /** The equation with every atom wrapped in `\htmlData{f=<index>}{…}` (same look, hit-testable in the DOM). */
  wrapped: string;
  /** Source ranges of the atoms, by index. */
  ranges: [number, number][];
  /** Atoms that are a bare argument (`x^2`, `\frac12`): they need braces around their wrapper. */
  bare: boolean[];
  /** Positions of relation signs (=, <…) at the top level. */
  relations: { start: number; end: number; sign: string }[];
  items: Item[];
}

interface Leaf {
  t: "leaf";
  idx: number;
  start: number;
  end: number;
}
interface Comp {
  t: "comp";
  kind: "group" | "frac" | "supsub" | "sqrt" | "leftright";
  start?: number;
  end?: number;
  slots: { role: string; seq: Item[] }[];
}
interface Opaque {
  t: "opaque";
}
type Item = Leaf | Comp | Opaque;

const CMD = String.raw`(?:\\[a-zA-Z]+|\\.|[^\s\\])`;
const back = (src: string, pos: number | undefined, re: RegExp) => {
  if (pos === undefined) return undefined;
  const m = src.slice(0, pos).match(re);
  return m ? pos - m[0].length : undefined;
};
const fwd = (src: string, pos: number | undefined, re: RegExp) => {
  if (pos === undefined) return undefined;
  const m = src.slice(pos).match(re);
  return m ? pos + m[0].length : undefined;
};
const maxOf = (...xs: (number | undefined)[]) => {
  const ys = xs.filter((x): x is number => x !== undefined);
  return ys.length ? Math.max(...ys) : undefined;
};

/** Source start of an AST node (composite nodes carry no location: it is rebuilt from their children and command). */
function astStart(src: string, n: any): number | undefined {
  if (!n) return undefined;
  if (n.loc) return n.loc.start;
  switch (n.type) {
    case "supsub":
      return astStart(src, n.base);
    case "genfrac":
      return back(src, astStart(src, n.numer), /\\[a-zA-Z]+\s*$/);
    case "sqrt":
      return back(src, astStart(src, n.index ?? n.body), /\\sqrt\s*(?:\[\s*)?$/);
    case "leftright":
      return back(src, astStart(src, n.body?.[0]), new RegExp(String.raw`\\left\s*${CMD}\s*$`));
  }
  return undefined;
}

function astEnd(src: string, n: any): number | undefined {
  if (!n) return undefined;
  if (n.loc) return n.loc.end;
  switch (n.type) {
    case "supsub":
      return maxOf(astEnd(src, n.sup), astEnd(src, n.sub), astEnd(src, n.base));
    case "genfrac":
      return maxOf(astEnd(src, n.numer), astEnd(src, n.denom));
    case "sqrt":
      return astEnd(src, n.body);
    case "leftright":
      return fwd(src, astEnd(src, n.body?.at(-1)), new RegExp(String.raw`^\s*\\right\s*${CMD}`));
  }
  return undefined;
}

interface Ctx {
  src: string;
  ranges: [number, number][];
  bare: boolean[];
  relations: FragmentModel["relations"];
}

/** An argument of a function (numerator, exponent, radicand…); `bare` when written without braces. */
function seqOf(ctx: Ctx, x: any, depth: number): Item[] {
  if (!x) return [];
  if (x.type === "ordgroup") return list(ctx, x.body, depth, ctx.src[x.loc?.start ?? 0] !== "{");
  return list(ctx, [x], depth, true);
}

function list(ctx: Ctx, nodes: any[], depth: number, bare = false): Item[] {
  return (nodes ?? []).map((n) => item(ctx, n, depth, bare));
}

function item(ctx: Ctx, n: any, depth: number, bare = false): Item {
  switch (n?.type) {
    case "mathord":
    case "textord":
    case "atom": {
      if (!n.loc) return { t: "opaque" };
      const idx = ctx.ranges.length;
      ctx.ranges.push([n.loc.start, n.loc.end]);
      ctx.bare.push(bare);
      if (depth === 0 && n.type === "atom" && n.family === "rel") ctx.relations.push({ start: n.loc.start, end: n.loc.end, sign: ctx.src.slice(n.loc.start, n.loc.end) });
      return { t: "leaf", idx, start: n.loc.start, end: n.loc.end };
    }
    case "ordgroup":
      return { t: "comp", kind: "group", start: n.loc?.start, end: n.loc?.end, slots: [{ role: "", seq: list(ctx, n.body, depth + 1) }] };
    case "genfrac":
      return {
        t: "comp",
        kind: "frac",
        start: astStart(ctx.src, n),
        end: astEnd(ctx.src, n),
        slots: [
          { role: "numerador", seq: seqOf(ctx, n.numer, depth + 1) },
          { role: "denominador", seq: seqOf(ctx, n.denom, depth + 1) },
        ],
      };
    case "supsub":
      return {
        t: "comp",
        kind: "supsub",
        start: astStart(ctx.src, n),
        end: astEnd(ctx.src, n),
        slots: [
          { role: "", seq: seqOf(ctx, n.base, depth + 1) },
          { role: "exponente", seq: seqOf(ctx, n.sup, depth + 1) },
          { role: "subíndice", seq: seqOf(ctx, n.sub, depth + 1) },
        ],
      };
    case "sqrt":
      return {
        t: "comp",
        kind: "sqrt",
        start: astStart(ctx.src, n),
        end: astEnd(ctx.src, n),
        slots: [
          { role: "índice de la raíz", seq: seqOf(ctx, n.index, depth + 1) },
          { role: "radicando", seq: seqOf(ctx, n.body, depth + 1) },
        ],
      };
    case "leftright":
      return { t: "comp", kind: "leftright", start: astStart(ctx.src, n), end: astEnd(ctx.src, n), slots: [{ role: "entre paréntesis", seq: list(ctx, n.body, depth + 1) }] };
    default:
      return { t: "opaque" };
  }
}

/** Parses `latex` and maps its atoms; null when it does not parse or has nothing selectable. */
export function buildFragmentModel(latex: string): FragmentModel | null {
  let ast: any[];
  try {
    ast = (katex as any).__parse(latex, { trust: true, strict: "ignore", throwOnError: true });
  } catch {
    return null;
  }
  const ctx: Ctx = { src: latex, ranges: [], bare: [], relations: [] };
  const items = list(ctx, ast, 0);
  if (!ctx.ranges.length) return null;
  let wrapped = latex;
  ctx.ranges
    .map((r, i) => [r, i] as const)
    .sort((a, b) => b[0][0] - a[0][0])
    .forEach(([[start, end], i]) => {
      const w = `\\htmlData{f=${i}}{${wrapped.slice(start, end)}}`;
      wrapped = `${wrapped.slice(0, start)}${ctx.bare[i] ? `{${w}}` : w}${wrapped.slice(end)}`;
    });
  return { latex, leaves: ctx.ranges.length, wrapped, ranges: ctx.ranges, bare: ctx.bare, relations: ctx.relations, items };
}

const startOf = (it: Item) => (it.t === "leaf" || it.t === "comp" ? it.start : undefined);
const endOf = (it: Item) => (it.t === "leaf" || it.t === "comp" ? it.end : undefined);

/** True when every atom under `it` is selected and its source range is known (so it can be a whole unit). */
function full(it: Item, sel: Set<number>): boolean {
  if (it.t === "leaf") return sel.has(it.idx);
  if (it.t === "opaque" || it.start === undefined || it.end === undefined) return false;
  const kids = it.slots.flatMap((s) => s.seq);
  return kids.length > 0 && kids.every((k) => full(k, sel));
}

function collect(seq: Item[], sel: Set<number>, roles: string[], out: { start: number; end: number; roles: string[] }[]) {
  let run: Item[] = [];
  const flush = () => {
    const only = run.length === 1 ? run[0]! : null;
    // The interior of a root or of parentheses alone means the interior (the learner cannot point at the sign itself).
    if (only?.t === "comp" && (only.kind === "sqrt" || only.kind === "leftright")) {
      for (const slot of only.slots) collect(slot.seq, sel, slot.role ? [...roles, slot.role] : roles, out);
    } else if (run.length) out.push({ start: startOf(run[0]!)!, end: endOf(run.at(-1)!)!, roles });
    run = [];
  };
  for (const it of seq) {
    if (full(it, sel)) run.push(it);
    else {
      flush();
      if (it.t === "comp") for (const slot of it.slots) collect(slot.seq, sel, slot.role ? [...roles, slot.role] : roles, out);
    }
  }
  flush();
}

/** The balanced pieces of the equation covered by the selected atoms, each with where it sits. */
export function selectParts(model: FragmentModel, selected: Set<number>): FragmentPart[] {
  const raw: { start: number; end: number; roles: string[] }[] = [];
  collect(model.items, selected, [], raw);
  const rel = model.relations.length === 1 ? model.relations[0]! : null;
  return raw
    .sort((a, b) => a.start - b.start)
    .map(({ start, end, roles }) => {
      const where = [...roles];
      if (rel) {
        const name = rel.sign === "=" ? "igualdad" : "desigualdad";
        where.push(end <= rel.start ? `lado izquierdo de la ${name}` : start >= rel.end ? `lado derecho de la ${name}` : `abarca la ${name}`);
      }
      return { latex: model.latex.slice(start, end), start, end, where };
    });
}

/** The equation with every part wrapped in « » so the exact position is unambiguous. */
export function markParts(latex: string, parts: FragmentPart[]): string {
  let out = latex;
  for (const p of [...parts].sort((a, b) => b.start - a.start)) out = `${out.slice(0, p.start)}«${out.slice(p.start, p.end)}»${out.slice(p.end)}`;
  return out;
}

/** Report for the agent: the complete equation, what was marked, and where. */
export function describeFragment(el: SceneElement, parts: FragmentPart[], scene: Scene): string {
  const who = `[${el.id}] (${el.source}) ${KIND.math}${el.color ? ` ${colorName(el.color)}` : ""}`;
  const lines = [`Fragmento marcado dentro de una ecuación: ${who}.`, `Ecuación completa: $${el.latex}$${el.verdict ? ` — ${el.verdict}` : ""}`];
  if (parts.length === 1) lines.push(`Parte marcada: $${parts[0]!.latex}$${parts[0]!.where.length ? ` (${parts[0]!.where.join(", ")})` : ""}`);
  else parts.forEach((p, i) => lines.push(`Parte marcada ${i + 1}: $${p.latex}$${p.where.length ? ` (${p.where.join(", ")})` : ""}`));
  lines.push(`Con la marca: ${markParts(el.latex ?? "", parts)}`);
  if (el.source === "presentación" && scene.presentation) {
    const p = scene.presentation;
    lines.push(`Presentación «${p.title}», paso ${p.step}/${p.total}; explicación de ese paso: "${p.caption.replace(/\s+/g, " ")}"`);
    const notes = notesFor(el.id, scene.notes);
    if (notes.length) lines.push(`Sobre esa línea: ${notes.join("; ")}`);
  }
  return lines.join("\n");
}
