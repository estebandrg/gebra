// Resolvente: guided quadratic formula. a, b, c → Δ → nature → roots, each box validated with a hint.
import "./resolvente.css";
import { formatNumber, polyCoeffs } from "../../shared/poly";
import { applyStep, nextStep, resolventeResult, startResolvente, type ResolventeData, type Step } from "../../shared/tools/resolvente";
import type { Exercise, ToolItem } from "../../shared/types";
import type { BoardView } from "../board";
import { el, renderMath, toast } from "../render";

const dataOf = (item: ToolItem) => item.data as unknown as ResolventeData;

const quadCache = new Map<string, boolean>();
function isQuadratic(ex: Exercise) {
  if (!quadCache.has(ex.id)) {
    let ok = false;
    if (ex.kind === "solve") {
      try {
        const c = polyCoeffs(ex.latex);
        ok = c.length === 3 && c[0] !== 0;
      } catch {
        /* not a polynomial equation */
      }
    }
    quadCache.set(ex.id, ok);
  }
  return quadCache.get(ex.id)!;
}

const LABEL: Record<Step, string> = { a: "a", b: "b", c: "c", delta: "Δ", nature: "naturaleza", x1: "x₁", x2: "x₂" };
const INSTRUCTION: Record<Step, string> = {
  a: "Pasá todo a un miembro (ax² + bx + c = 0) y escribí a.",
  b: "Ahora b, el coeficiente de x, con su signo.",
  c: "Y c, el término independiente, con su signo.",
  delta: "Calculá el discriminante Δ = b² − 4ac.",
  nature: "Mirando el signo de Δ: ¿cuántas raíces reales tiene?",
  x1: "Usá la fórmula con + o con − y escribí una raíz.",
  x2: "Ahora la otra raíz, con el otro signo del ±.",
};

const neg = (v: number) => (v < 0 ? `\\left(${formatNumber(v)}\\right)` : formatNumber(v));
const tex = (v: number) => {
  const f = formatNumber(v);
  const m = f.match(/^(-?)(\d+)\/(\d+)$/);
  return m ? `${m[1]}\\frac{${m[2]}}{${m[3]}}` : f;
};

function focusNext(board: BoardView, id: string) {
  requestAnimationFrame(() => board.elementFor(id)?.querySelector<HTMLElement>(".rv-box.next input, .rv-nature.next button")?.focus());
}

function submit(board: BoardView, id: string, step: string, value: string) {
  const item = board.get(id) as ToolItem | undefined;
  if (!item) return;
  const r = applyStep(dataOf(item), step, value);
  item.data = r.data as unknown as Record<string, unknown>;
  board.toolChanged(item);
  const box = board.elementFor(id)?.querySelector<HTMLElement>(`[data-step="${step}"]`);
  if (r.ok) {
    box?.classList.add("pop");
    if (nextStep(r.data) === null) toast(resolventeResult(r.data) ? "¡Raíces encontradas! 🎉" : "Δ < 0: no tiene raíces reales");
    focusNext(board, id);
  } else if (box) {
    box.classList.remove("shake");
    void box.offsetWidth;
    box.classList.add("shake");
  }
}

function box(board: BoardView, item: ToolItem, parent: HTMLElement, step: Step) {
  const b = el("label", "rv-box", parent);
  b.dataset.step = step;
  el("span", "rv-lbl", b).textContent = `${LABEL[step]} =`;
  const input = el("input", "", b);
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("aria-label", LABEL[step]);
  input.addEventListener("keydown", (ev) => {
    const k = ev.key;
    if (k === "Enter" || (k === "Tab" && !ev.shiftKey)) {
      ev.preventDefault();
      submit(board, item.id, step, input.value);
    }
    ev.stopPropagation();
  });
}

function build(item: ToolItem, content: HTMLElement, board: BoardView) {
  content.classList.add("resolvente");
  el("div", "rv-eq", content);
  const f = el("div", "rv-formula", content);
  renderMath(f, "x=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}");
  el("div", "rv-step", content);
  const abc = el("div", "rv-row", content);
  for (const s of ["a", "b", "c"] as const) box(board, item, abc, s);
  const drow = el("div", "rv-row", content);
  box(board, item, drow, "delta");
  el("div", "rv-sub rv-dsub", drow);
  const nat = el("div", "rv-nature", content);
  nat.dataset.step = "nature";
  for (const [v, text] of [["dos", "Dos raíces reales"], ["doble", "Una raíz doble"], ["ninguna", "Sin raíces reales"]] as const) {
    const b = el("button", "", nat);
    b.dataset.value = v;
    b.textContent = text;
    b.addEventListener("pointerdown", (e) => e.stopPropagation());
    b.addEventListener("click", () => submit(board, item.id, "nature", v));
  }
  el("div", "rv-sub rv-xsub", content);
  const xs = el("div", "rv-row", content);
  box(board, item, xs, "x1");
  box(board, item, xs, "x2");
  el("div", "rv-hint", content);
  const done = el("div", "rv-done", content);
  el("div", "rv-result", done);
  const write = el("button", "rv-write", done);
  write.addEventListener("pointerdown", (e) => e.stopPropagation());
  write.addEventListener("click", () => {
    const cur = board.get(item.id) as ToolItem | undefined;
    if (!cur) return;
    const d = dataOf(cur);
    const latex = resolventeResult(d);
    if (!latex) return;
    if (d.card && board.get(d.card)) board.addCardStep(d.card, latex, false);
    else {
      const spot = board.freeSpot(320, 60);
      board.addMath(spot.x, spot.y, latex, {}, false);
    }
    cur.data = { ...cur.data, written: true };
    board.toolChanged(cur);
  });
}

function render(item: ToolItem, content: HTMLElement, board: BoardView) {
  const d = dataOf(item);
  if (!content.querySelector(".rv-formula")) build(item, content, board);
  const eq = content.querySelector<HTMLElement>(".rv-eq")!;
  if (eq.dataset.key !== d.eq) {
    eq.dataset.key = d.eq;
    renderMath(eq, d.eq);
  }
  const next = nextStep(d);
  content.querySelector<HTMLElement>(".rv-step")!.textContent = next ? INSTRUCTION[next] : "¡Listo!";
  for (const b of content.querySelectorAll<HTMLElement>(".rv-box")) {
    const s = b.dataset.step as Step;
    const input = b.querySelector("input")!;
    const done = d.entries[s] !== undefined;
    const isNext = s === next;
    b.classList.toggle("ok", done);
    b.classList.toggle("next", isNext);
    b.classList.toggle("bad", isNext && d.wrong?.step === s);
    b.classList.toggle("off", !done && !isNext);
    b.hidden = s === "x2" && d.entries.nature !== undefined && d.entries.nature !== 0;
    input.readOnly = !isNext;
    input.tabIndex = isNext ? 0 : -1;
    input.placeholder = isNext ? "?" : "";
    if (done) input.value = s === "x1" || s === "x2" ? (d.raw[s] ?? formatNumber(d.entries[s]!)) : formatNumber(d.entries[s]!);
    else if (!isNext) input.value = "";
    else if (document.activeElement !== input && d.wrong?.step === s) input.value = d.wrong.value;
  }
  const nat = content.querySelector<HTMLElement>(".rv-nature")!;
  nat.classList.toggle("next", next === "nature");
  nat.classList.toggle("bad", next === "nature" && d.wrong?.step === "nature");
  for (const b of nat.querySelectorAll<HTMLButtonElement>("button")) {
    const chosen = d.entries.nature !== undefined && ["dos", "doble", "ninguna"][d.entries.nature] === b.dataset.value;
    b.disabled = next !== "nature";
    b.classList.toggle("chosen", chosen);
  }
  const e = d.entries;
  const dsub = content.querySelector<HTMLElement>(".rv-dsub")!;
  const dkey = `${e.a}|${e.b}|${e.c}`;
  if (dsub.dataset.key !== dkey) {
    dsub.dataset.key = dkey;
    if (e.a !== undefined && e.b !== undefined && e.c !== undefined) renderMath(dsub, `\\Delta=${neg(e.b)}^{2}-4\\cdot ${neg(e.a)}\\cdot ${neg(e.c)}`);
    else dsub.textContent = "";
  }
  const xsub = content.querySelector<HTMLElement>(".rv-xsub")!;
  const xkey = `${dkey}|${e.delta}|${e.nature}`;
  if (xsub.dataset.key !== xkey) {
    xsub.dataset.key = xkey;
    if (e.delta !== undefined && e.nature !== undefined && e.nature !== 2 && e.a !== undefined && e.b !== undefined)
      renderMath(xsub, `x=\\frac{-${neg(e.b)}\\pm\\sqrt{${tex(e.delta)}}}{2\\cdot ${neg(e.a)}}`);
    else if (e.nature === 2) xsub.textContent = "Como Δ < 0, la raíz cuadrada no existe en los reales: no hay solución real.";
    else xsub.textContent = "";
  }
  content.querySelector<HTMLElement>(".rv-hint")!.textContent = d.wrong && d.wrong.step === next ? d.wrong.hint : "";
  const res = resolventeResult(d);
  content.classList.toggle("done", next === null);
  const resEl = content.querySelector<HTMLElement>(".rv-result")!;
  if (resEl.dataset.key !== (res ?? "")) {
    resEl.dataset.key = res ?? "";
    if (res) renderMath(resEl, res);
    else resEl.textContent = next === null ? "Sin raíces reales." : "";
  }
  const write = content.querySelector<HTMLButtonElement>(".rv-write")!;
  write.hidden = !res;
  write.disabled = !!item.data.written;
  write.textContent = item.data.written ? "Escrito ✓" : d.card ? "Escribir las raíces en la tarjeta" : "Escribir las raíces en la pizarra";
}

export function register(board: BoardView) {
  board.cardActions.push({
    id: "resolvente",
    label: "Resolvente",
    title: "Resolver con la fórmula resolvente, paso a paso",
    when: isQuadratic,
    run: (card, ex) => {
      const existing = board.board.items.find((i) => i.kind === "tool" && i.tool === "resolvente" && i.card === card.id);
      if (existing) return focusNext(board, existing.id);
      const data = startResolvente(ex.latex);
      data.card = card.id;
      const item = board.addTool("resolvente", data as unknown as Record<string, unknown>, card.id);
      focusNext(board, item.id);
    },
  });
  board.toolRenderers.set("resolvente", render);
}
