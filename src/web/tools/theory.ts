// Theory sheet: searchable formulas and reminders that slide over the board; any entry can go onto the board.
import "./theory.css";
import { searchTheory, THEORY, type TheoryEntry } from "../../shared/theory";
import type { BoardView } from "../board";
import { el, renderMath, renderRich, toast } from "../render";

const BOOK_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M8 7h7"/></svg>';

let sheet: HTMLElement | null = null;

function insert(board: BoardView, e: TheoryEntry) {
  const spot = board.freeSpot(420, 70);
  board.addText(spot.x, spot.y, `**${e.title}**\n$${e.latex}$`, { color: "blue" }, false);
  toast("Lo dejé en la pizarra");
}

function entryNode(board: BoardView, e: TheoryEntry, parent: HTMLElement) {
  const card = el("article", "th-entry", parent);
  card.dataset.id = e.id;
  el("h4", "", card).textContent = e.title;
  renderRich(el("p", "", card), e.text);
  renderMath(el("div", "th-formula", card), e.latex);
  if (e.example) {
    const ex = el("div", "th-example", card);
    el("span", "th-tag", ex).textContent = "Ejemplo";
    renderMath(el("div", "", ex), e.example);
  }
  const actions = el("div", "th-actions", card);
  const put = el("button", "th-insert", actions);
  put.textContent = "Insertar en la pizarra";
  put.addEventListener("click", () => insert(board, e));
  const copy = el("button", "th-copy", actions);
  copy.textContent = "Copiar LaTeX";
  copy.addEventListener("click", () => {
    void navigator.clipboard?.writeText(e.latex).then(
      () => toast("LaTeX copiado"),
      () => toast("No pude copiar"),
    );
  });
}

function build(board: BoardView): HTMLElement {
  const s = el("aside", "theory-sheet", document.body);
  s.id = "theory-sheet";
  s.hidden = true;
  s.setAttribute("aria-label", "Teoría y fórmulas");
  const head = el("header", "th-head", s);
  el("h3", "", head).textContent = "Teoría y fórmulas";
  const close = el("button", "th-close", head);
  close.title = "Cerrar (Esc)";
  close.setAttribute("aria-label", "Cerrar");
  close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  close.addEventListener("click", () => toggle(board, false));
  const search = el("input", "th-search", s);
  search.type = "search";
  search.placeholder = "Buscar: resolvente, Ruffini, diferencia de cuadrados…";
  search.addEventListener("input", () => filter(search.value));
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape") toggle(board, false);
    e.stopPropagation();
  });
  const body = el("div", "th-body", s);
  for (const sec of THEORY) {
    const d = el("details", "th-section", body);
    d.dataset.topic = sec.topic;
    d.dataset.id = sec.id;
    const sum = el("summary", "", d);
    sum.textContent = sec.title;
    el("span", "th-count", sum).textContent = String(sec.entries.length);
    for (const e of sec.entries) entryNode(board, e, d);
  }
  el("p", "th-empty", body).textContent = "No encontré nada con esas palabras.";
  return s;
}

function filter(q: string) {
  if (!sheet) return;
  const hits = q.trim() ? new Set(searchTheory(q).map((e) => e.id)) : null;
  for (const sec of sheet.querySelectorAll<HTMLDetailsElement>(".th-section")) {
    let any = false;
    for (const e of sec.querySelectorAll<HTMLElement>(".th-entry")) {
      const show = !hits || hits.has(e.dataset.id!);
      e.hidden = !show;
      any ||= show;
    }
    sec.hidden = !any;
    if (hits) sec.open = any;
  }
  sheet.querySelector<HTMLElement>(".th-empty")!.hidden = !hits || hits.size > 0;
}

/** Open the section of the selected card's topic. */
function focusTopic(board: BoardView) {
  if (!sheet) return;
  const sel = board.board.selection.map((id) => board.get(id)).find(Boolean);
  const cardId = sel?.kind === "card" ? sel.id : sel && "card" in sel ? sel.card : undefined;
  const card = cardId ? board.get(cardId) : undefined;
  const ex = card?.kind === "card" ? board.board.exercises.find((e) => e.id === card.exercise) : undefined;
  sheet.querySelectorAll(".th-section.match").forEach((n) => n.classList.remove("match"));
  const topic = ex?.topic === "division" || ex?.topic === "factorizar" || ex?.topic === "cuadratica" || ex?.topic === "lineal" || ex?.topic === "operaciones" ? ex.topic : null;
  if (!topic) {
    const first = sheet.querySelector<HTMLDetailsElement>(".th-section");
    if (first && !sheet.querySelector(".th-section[open]")) first.open = true;
    return;
  }
  const sec = sheet.querySelector<HTMLDetailsElement>(`.th-section[data-topic="${topic}"]`);
  if (!sec) return;
  sec.open = true;
  sec.classList.add("match");
  sec.scrollIntoView({ block: "start", behavior: "smooth" });
}

function toggle(board: BoardView, open?: boolean) {
  sheet ??= build(board);
  const show = open ?? !!sheet.hidden;
  sheet.hidden = !show;
  document.querySelector("[data-tool=theory]")?.classList.toggle("active", show);
  if (show) {
    focusTopic(board);
    requestAnimationFrame(() => sheet!.querySelector<HTMLInputElement>(".th-search")?.focus({ preventScroll: true }));
  }
}

export function register(board: BoardView) {
  const group = document.querySelector<HTMLElement>(".tools .group");
  if (group && !group.querySelector("[data-tool=theory]")) {
    const b = el("button", "", group);
    b.dataset.tool = "theory";
    b.title = "Teoría y fórmulas (F)";
    b.innerHTML = `${BOOK_ICON}<span class="label">Teoría</span>`;
    b.addEventListener("click", () => toggle(board));
  }
  document.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("math-field, textarea, input, select") || board.isEditing() || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === "f" || k === "F") {
      e.preventDefault();
      toggle(board);
    } else if (k === "Escape" && sheet && !sheet.hidden) toggle(board, false);
  });
}
