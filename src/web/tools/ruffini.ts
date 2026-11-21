// Ruffini: a real Ruffini table the learner fills cell by cell; every cell is validated with a hint.
import "./ruffini.css";
import { formatNumber, operand, polyCoeffs } from "../../shared/poly";
import {
  applyCell,
  cellLabel,
  divisorText,
  expectedTable,
  nextCell,
  parseDivision,
  rufResult,
  startRuffini,
  type RuffiniData,
} from "../../shared/tools/ruffini";
import type { Exercise, ToolItem } from "../../shared/types";
import type { BoardView } from "../board";
import { el, renderMath, toast } from "../render";

const TABLE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4v12M4 16h16M12 8v12"/><path d="M4 8h16"/></svg>';

const divisionCache = new Map<string, ReturnType<typeof parseDivision>>();
function divisionOf(ex: Exercise) {
  if (!divisionCache.has(ex.id)) divisionCache.set(ex.id, ex.kind === "divide" ? parseDivision(ex.latex) : null);
  return divisionCache.get(ex.id)!;
}

const dataOf = (item: ToolItem) => item.data as unknown as RuffiniData;

function focusNext(board: BoardView, id: string) {
  requestAnimationFrame(() => board.elementFor(id)?.querySelector<HTMLInputElement>(".rcell.next input")?.focus());
}

/** Open a Ruffini table (inside a card when given). Gauss uses it with a preset root. */
export function openRuffini(board: BoardView, dividend: string, coeffs: number[], root?: number, cardId?: string): ToolItem {
  const data = startRuffini(dividend, coeffs, root);
  if (cardId) data.card = cardId;
  const item = board.addTool("ruffini", data as unknown as Record<string, unknown>, cardId);
  focusNext(board, item.id);
  return item;
}

function instruction(d: RuffiniData, cell: string | null): string {
  if (!cell) return "¡Listo! Los primeros números son el cociente y el último, recuadrado, es el resto.";
  const i = Number(cell.slice(1));
  if (cell[0] === "c") return `Escribí el ${cellLabel(d, cell)} del dividendo${i > 0 ? " (si falta ese término, va 0)" : ""}.`;
  if (cell === "r")
    return d.fixedRoot ? `Escribí la raíz del divisor ${divisorText(d.root)} a la izquierda.` : "Elegí la raíz a probar: el a del divisor x − a.";
  const t = expectedTable(d.coeffs, d.root!);
  if (cell === "s0") return "Bajá el primer coeficiente tal cual.";
  if (cell[0] === "p") return `Multiplicá ${operand(t.s[i - 1]!)} por la raíz ${operand(d.root!)} y escribilo debajo de ${operand(t.c[i]!)}.`;
  return `Sumá la columna: ${operand(t.c[i]!)} + ${operand(t.p[i]!)}.`;
}

/** Cells to light up as the inputs of the next operation. */
function related(cell: string | null): string[] {
  if (!cell || cell[0] === "c" || cell === "r") return [];
  const i = Number(cell.slice(1));
  if (cell === "s0") return ["c0"];
  return cell[0] === "p" ? [`s${i - 1}`, "r"] : [`c${i}`, `p${i}`];
}

function submit(board: BoardView, id: string, cell: string, value: string) {
  const item = board.get(id) as ToolItem | undefined;
  if (!item) return;
  const r = applyCell(dataOf(item), cell, value);
  item.data = r.data as unknown as Record<string, unknown>;
  board.toolChanged(item);
  const c = board.elementFor(id)?.querySelector<HTMLElement>(`[data-cell="${cell}"]`);
  if (r.ok) {
    c?.classList.add("pop");
    if (!nextCell(r.data)) toast("¡Cuadro completo! 🎉");
    focusNext(board, id);
  } else if (c) {
    c.classList.remove("shake");
    void c.offsetWidth;
    c.classList.add("shake");
  }
}

function writeResult(board: BoardView, id: string) {
  const item = board.get(id) as ToolItem | undefined;
  if (!item) return;
  const d = dataOf(item);
  const res = rufResult(d);
  if (!res) return;
  if (d.card && board.get(d.card)) board.addCardStep(d.card, res.latex, false);
  else {
    const spot = board.freeSpot(320, 60);
    board.addMath(spot.x, spot.y, res.latex, {}, false);
  }
  item.data = { ...item.data, written: true };
  board.toolChanged(item);
}

function reset(board: BoardView, id: string) {
  const item = board.get(id) as ToolItem | undefined;
  if (!item) return;
  const old = dataOf(item);
  const fresh = startRuffini(old.dividend, old.coeffs, old.fixedRoot ? old.root : undefined);
  if (old.card) fresh.card = old.card;
  item.data = fresh as unknown as Record<string, unknown>;
  board.toolChanged(item);
  focusNext(board, id);
}

function build(item: ToolItem, content: HTMLElement, board: BoardView) {
  const d = dataOf(item);
  const n = d.coeffs.length - 1;
  content.classList.add("ruffini");
  el("div", "ruf-expr", content);
  el("div", "ruf-step", content);
  const grid = el("div", "ruf-grid", content);
  grid.style.gridTemplateColumns = `repeat(${n + 2}, minmax(46px, auto))`;
  const cell = (id: string | null, row: number, col: number, cls: string) => {
    const c = el("div", `rcell ${cls}`, grid);
    c.style.gridRow = String(row);
    c.style.gridColumn = String(col);
    if (!id) return;
    c.dataset.cell = id;
    const input = el("input", "", c);
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", cellLabel(d, id));
    input.addEventListener("keydown", (ev) => {
      const k = ev.key;
      if (k === "Enter" || (k === "Tab" && !ev.shiftKey)) {
        ev.preventDefault();
        submit(board, item.id, id, input.value);
      }
      ev.stopPropagation();
    });
  };
  cell(null, 1, 1, "corner bar");
  for (let i = 0; i <= n; i++) cell(`c${i}`, 1, i + 2, "coef");
  cell("r", 2, 1, "root bar");
  cell(null, 2, 2, "prod");
  for (let i = 1; i <= n; i++) cell(`p${i}`, 2, i + 2, "prod");
  cell(null, 3, 1, "spacer");
  for (let i = 0; i <= n; i++) cell(`s${i}`, 3, i + 2, `res${i === n ? " rest" : ""}`);
  el("div", "ruf-hint", content);
  el("div", "ruf-result", content);
  const actions = el("div", "ruf-actions", content);
  const write = el("button", "ruf-write", actions);
  write.addEventListener("click", () => writeResult(board, item.id));
  const again = el("button", "ruf-reset", actions);
  again.textContent = "Empezar de nuevo";
  again.addEventListener("click", () => reset(board, item.id));
}

function render(item: ToolItem, content: HTMLElement, board: BoardView) {
  const d = dataOf(item);
  if (!content.querySelector(".ruf-grid")) build(item, content, board);
  const expr = content.querySelector<HTMLElement>(".ruf-expr")!;
  const exprKey = `${d.dividend}|${d.root ?? "?"}`;
  if (expr.dataset.key !== exprKey) {
    expr.dataset.key = exprKey;
    const divisor = d.root === undefined ? "x-a" : divisorText(d.root).slice(1, -1).replace("−", "-");
    renderMath(expr, `\\left(${d.dividend}\\right)\\div\\left(${divisor}\\right)`);
  }
  const next = nextCell(d);
  const rel = new Set(related(next));
  content.querySelector<HTMLElement>(".ruf-step")!.textContent = instruction(d, next);
  for (const c of content.querySelectorAll<HTMLElement>(".rcell[data-cell]")) {
    const id = c.dataset.cell!;
    const input = c.querySelector("input")!;
    const done = id in d.entries;
    const isNext = id === next;
    c.classList.toggle("ok", done);
    c.classList.toggle("next", isNext);
    c.classList.toggle("related", rel.has(id));
    c.classList.toggle("bad", isNext && d.wrong?.cell === id);
    input.readOnly = !isNext;
    input.tabIndex = isNext ? 0 : -1;
    input.placeholder = isNext ? "?" : "";
    if (done) input.value = formatNumber(d.entries[id]!);
    else if (!isNext) input.value = "";
    else if (document.activeElement !== input && d.wrong?.cell === id) input.value = d.wrong.value;
  }
  content.querySelector<HTMLElement>(".ruf-hint")!.textContent = d.wrong && d.wrong.cell === next ? d.wrong.hint : "";
  const res = rufResult(d);
  content.classList.toggle("done", !!res);
  const resEl = content.querySelector<HTMLElement>(".ruf-result")!;
  const key = res?.latex ?? "";
  if (resEl.dataset.key !== key) {
    resEl.dataset.key = key;
    if (res) renderMath(resEl, `C(x)=${res.quotient}\\qquad R=${res.remainder}`);
    else resEl.textContent = "";
  }
  const write = content.querySelector<HTMLButtonElement>(".ruf-write")!;
  write.hidden = !res;
  write.disabled = !!item.data.written;
  write.textContent = item.data.written ? "Escrito ✓" : d.card ? "Escribir el resultado en la tarjeta" : "Escribir el resultado en la pizarra";
}

/** Free Ruffini from the selected polynomial line. */
function openFromSelection(board: BoardView) {
  const sel = board
    .focusIds()
    .map((id) => board.get(id))
    .find((i) => i?.kind === "math");
  if (!sel || sel.kind !== "math") return toast("Seleccioná la línea con el polinomio que querés dividir");
  try {
    const coeffs = polyCoeffs(sel.latex);
    if (coeffs.length < 2) return toast("Necesito un polinomio de grado 1 o más");
    openRuffini(board, sel.latex.replace(/=\s*0\s*$/, ""), coeffs);
  } catch {
    toast("No pude leer ese polinomio");
  }
}

export function register(board: BoardView) {
  board.cardActions.push({
    id: "ruffini",
    label: "Ruffini",
    title: "Abrir el cuadro de Ruffini para esta división",
    when: (ex) => !!divisionOf(ex),
    run: (card, ex) => {
      const existing = board.board.items.find((i) => i.kind === "tool" && i.tool === "ruffini" && i.card === card.id);
      if (existing) return focusNext(board, existing.id);
      const div = divisionOf(ex)!;
      openRuffini(board, div.dividend, div.coeffs, div.root, card.id);
    },
  });
  board.toolRenderers.set("ruffini", render);
  const group = document.querySelector<HTMLElement>(".tools .group");
  if (group && !group.querySelector("[data-tool=ruffini]")) {
    const b = el("button", "", group);
    b.dataset.tool = "ruffini";
    b.title = "Ruffini con el polinomio seleccionado";
    b.innerHTML = `${TABLE_ICON}<span class="label">Ruffini</span>`;
    b.addEventListener("click", () => openFromSelection(board));
  }
}
