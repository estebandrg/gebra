// Gauss: candidate rational roots ±p/q as chips; one click evaluates P(r); a root goes to Ruffini.
import "./gauss.css";
import { formatNumber, polyCoeffs } from "../../shared/poly";
import { gaussCandidates, startGauss, tryCandidate, type GaussData } from "../../shared/tools/gauss";
import type { Exercise, ToolItem } from "../../shared/types";
import type { BoardView } from "../board";
import { el, renderMath, toast } from "../render";
import { openRuffini } from "./ruffini";

const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M8.5 11h5M11 8.5v5"/></svg>';

const dataOf = (item: ToolItem) => item.data as unknown as GaussData;

/** Polynomial of an exercise when Gauss makes sense for it (degree ≥ 3, integer coefficients). */
const polyCache = new Map<string, { poly: string; coeffs: number[] } | null>();
function polyOf(ex: Exercise) {
  if (!polyCache.has(ex.id)) {
    let found: { poly: string; coeffs: number[] } | null = null;
    if (ex.kind === "factor" || ex.kind === "solve") {
      try {
        const coeffs = polyCoeffs(ex.latex);
        const poly = ex.kind === "solve" ? ex.latex.replace(/=\s*0\s*$/, "") : ex.latex;
        if (coeffs.length >= 4 && gaussCandidates(coeffs)) found = { poly, coeffs };
      } catch {
        /* not a polynomial */
      }
    }
    polyCache.set(ex.id, found);
  }
  return polyCache.get(ex.id)!;
}

export function openGauss(board: BoardView, poly: string, coeffs: number[], cardId?: string): ToolItem {
  const data = startGauss(poly, coeffs);
  if (cardId) data.card = cardId;
  return board.addTool("gauss", data as unknown as Record<string, unknown>, cardId);
}

function build(item: ToolItem, content: HTMLElement) {
  content.classList.add("gauss");
  el("div", "gauss-expr", content);
  const why = el("div", "gauss-why", content);
  why.textContent =
    "Si P tiene raíces racionales p/q, p divide al término independiente y q al coeficiente principal. Probá cada candidato: si P(r) = 0, r es raíz (teorema del resto).";
  el("div", "gauss-note", content);
  const rows = el("div", "gauss-rows", content);
  el("div", "gauss-row p", rows);
  el("div", "gauss-row q", rows);
  el("div", "gauss-chips", content);
  el("div", "gauss-found", content);
  void item;
}

function onChip(board: BoardView, id: string, r: number) {
  const item = board.get(id) as ToolItem | undefined;
  if (!item) return;
  const d = tryCandidate(dataOf(item), r);
  item.data = d as unknown as Record<string, unknown>;
  board.toolChanged(item);
  if (d.tried[formatNumber(r)] === 0) toast(`¡${formatNumber(r)} es raíz! Podés dividir por Ruffini`);
}

function render(item: ToolItem, content: HTMLElement, board: BoardView) {
  const d = dataOf(item);
  if (!content.querySelector(".gauss-chips")) build(item, content);
  const g = gaussCandidates(d.coeffs);
  const expr = content.querySelector<HTMLElement>(".gauss-expr")!;
  if (expr.dataset.key !== d.poly) {
    expr.dataset.key = d.poly;
    renderMath(expr, `P(x)=${d.poly}`);
  }
  const note = content.querySelector<HTMLElement>(".gauss-note")!;
  note.textContent = !g
    ? "Los coeficientes no son enteros: Gauss no aplica."
    : g.factorX
      ? `El término independiente es 0: primero sacá factor común x${g.factorX > 1 ? `^${g.factorX}` : ""}; los candidatos son del polinomio que queda.`
      : "";
  if (!g) return;
  const a0 = g.reduced.at(-1)!;
  const an = g.reduced[0]!;
  content.querySelector<HTMLElement>(".gauss-row.p")!.innerHTML = "";
  content.querySelector<HTMLElement>(".gauss-row.q")!.innerHTML = "";
  const row = (cls: string, label: string, values: number[]) => {
    const r = content.querySelector<HTMLElement>(`.gauss-row.${cls}`)!;
    el("span", "lbl", r).textContent = label;
    for (const v of values) el("span", "num", r).textContent = String(v);
  };
  row("p", `p divide a ${a0}:`, g.p);
  row("q", `q divide a ${an}:`, g.q);
  const chips = content.querySelector<HTMLElement>(".gauss-chips")!;
  if (chips.dataset.key !== g.candidates.join(",")) {
    chips.dataset.key = g.candidates.join(",");
    chips.textContent = "";
    for (const r of g.candidates) {
      const b = el("button", "chip", chips);
      b.dataset.r = formatNumber(r);
      b.addEventListener("pointerdown", (e) => e.stopPropagation());
      b.addEventListener("click", () => onChip(board, item.id, r));
    }
  }
  for (const b of chips.querySelectorAll<HTMLButtonElement>(".chip")) {
    const key = b.dataset.r!;
    const v = d.tried[key];
    b.classList.toggle("root", v === 0);
    b.classList.toggle("miss", v !== undefined && v !== 0);
    b.textContent = v === undefined ? key : `P(${key}) = ${formatNumber(v)}`;
    b.title = v === undefined ? `Probar x = ${key}` : v === 0 ? `${key} es raíz` : `${key} no es raíz`;
  }
  const found = content.querySelector<HTMLElement>(".gauss-found")!;
  const roots = Object.entries(d.tried).filter(([, v]) => v === 0);
  const sig = roots.map(([r]) => r).join(",");
  if (found.dataset.key !== sig) {
    found.dataset.key = sig;
    found.textContent = "";
    for (const [r] of roots) {
      const b = el("button", "use", found);
      b.textContent = `Dividir por (x ${r.startsWith("-") ? "+ " + r.slice(1) : "− " + r}) con Ruffini`;
      b.addEventListener("pointerdown", (e) => e.stopPropagation());
      b.addEventListener("click", () => {
        const cur = board.get(item.id) as ToolItem | undefined;
        if (!cur) return;
        const cd = dataOf(cur);
        const gg = gaussCandidates(cd.coeffs)!;
        const value = r.includes("/") ? Number(r.split("/")[0]) / Number(r.split("/")[1]) : Number(r);
        const poly = gg.factorX ? polyLatex(gg.reduced) : cd.poly;
        const prefix = gg.factorX ? (gg.factorX > 1 ? `x^{${gg.factorX}}` : "x") : undefined;
        openRuffini(board, poly, gg.reduced, value, cd.card, prefix);
      });
    }
  }
}

function polyLatex(coeffs: number[]): string {
  const n = coeffs.length - 1;
  return (
    coeffs
      .map((c, i) => ({ c, p: n - i }))
      .filter(({ c }) => c !== 0)
      .map(({ c, p }, k) => {
        const sign = c < 0 ? "-" : k ? "+" : "";
        const abs = Math.abs(c);
        const coef = abs === 1 && p > 0 ? "" : formatNumber(abs);
        return `${sign}${coef}${p === 0 ? "" : p === 1 ? "x" : `x^{${p}}`}`;
      })
      .join("") || "0"
  );
}

function openFromSelection(board: BoardView) {
  const sel = board
    .focusIds()
    .map((id) => board.get(id))
    .find((i) => i?.kind === "math");
  if (!sel || sel.kind !== "math") return toast("Seleccioná la línea con el polinomio");
  try {
    const coeffs = polyCoeffs(sel.latex);
    if (coeffs.length < 3) return toast("Gauss sirve para polinomios de grado 2 o más");
    if (!gaussCandidates(coeffs)) return toast("Gauss necesita coeficientes enteros");
    openGauss(board, sel.latex.replace(/=\s*0\s*$/, ""), coeffs);
  } catch {
    toast("No pude leer ese polinomio");
  }
}

export function register(board: BoardView) {
  board.cardActions.push({
    id: "gauss",
    label: "Gauss",
    title: "Buscar raíces racionales candidatas (±p/q)",
    when: (ex) => !!polyOf(ex),
    run: (card, ex) => {
      const existing = board.board.items.find((i) => i.kind === "tool" && i.tool === "gauss" && i.card === card.id);
      if (existing) return;
      const p = polyOf(ex)!;
      openGauss(board, p.poly, p.coeffs, card.id);
    },
  });
  board.toolRenderers.set("gauss", render);
  const group = document.querySelector<HTMLElement>(".tools .group");
  if (group && !group.querySelector("[data-tool=gauss]")) {
    const b = el("button", "", group);
    b.dataset.tool = "gauss";
    b.title = "Gauss: raíces candidatas del polinomio seleccionado";
    b.innerHTML = `${ICON}<span class="label">Gauss</span>`;
    b.addEventListener("click", () => openFromSelection(board));
  }
}
