// Exercises modal: the worksheets (TP 1, TP 2, TP 3) split into sections; any exercise goes onto the board as a card.
import "./catalog.css";
import {
  WORKSHEETS,
  catalogExercise,
  catalogItems,
  itemKey,
  onBoard,
  searchCatalog,
  worksheet,
  type CatalogItem,
  type CatalogSection,
  type WorksheetId,
} from "../../shared/catalog";
import type { BoardView } from "../board";
import { el, renderMath, toast } from "../render";

const ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6"/></svg>';

let modal: HTMLElement | null = null;
let currentWs: WorksheetId = WORKSHEETS[0]!.id;
/** Last open section of each worksheet. */
const currentSection = new Map<WorksheetId, string>(WORKSHEETS.map((w) => [w.id, w.sections[0]!.id]));

const sectionsOfCurrent = (): CatalogSection[] => worksheet(currentWs).sections;
const currentSec = (): CatalogSection => sectionsOfCurrent().find((s) => s.id === currentSection.get(currentWs))!;

function hasHit(sec: CatalogSection, hits: Set<string> | null): boolean {
  return sec.groups.some((g) => g.items.some((i) => !hits || hits.has(itemKey(i))));
}

function hitsOf(query: string): Set<string> | null {
  return query.trim() ? new Set(searchCatalog(query).map(itemKey)) : null;
}

function itemNode(board: BoardView, item: CatalogItem, parent: HTMLElement) {
  const b = el("button", "cat-item", parent);
  b.dataset.id = item.id;
  b.title = item.prompt;
  el("span", "cat-id", b).textContent = item.id;
  renderMath(el("span", "cat-math", b), item.latex);
  if (onBoard(board.board.exercises, item)) el("span", "cat-tag", b).textContent = "en la pizarra";
  b.addEventListener("click", () => {
    board.addExercise(catalogExercise(item));
    toggle(board, false);
    toast(`Puse el ${item.id} (${worksheet(item.ws).tab}) en la pizarra`);
  });
}

function render(board: BoardView) {
  if (!modal) return;
  const hits = hitsOf(modal.querySelector<HTMLInputElement>(".cat-search")!.value);

  modal.querySelectorAll<HTMLButtonElement>(".cat-ws").forEach((tab) => {
    const id = tab.dataset.ws as WorksheetId;
    const n = catalogItems(id).filter((i) => !hits || hits.has(itemKey(i))).length;
    tab.querySelector(".cat-n")!.textContent = String(n);
    tab.classList.toggle("empty", n === 0);
    tab.classList.toggle("active", id === currentWs);
    tab.setAttribute("aria-selected", String(id === currentWs));
  });
  modal.querySelector(".cat-sub")!.textContent = `${worksheet(currentWs).title} — Matemática 2 (UNRN)`;

  const tabs = modal.querySelector<HTMLElement>(".cat-tabs")!;
  tabs.textContent = "";
  for (const sec of sectionsOfCurrent()) {
    const t = el("button", "cat-tab", tabs);
    t.dataset.id = sec.id;
    t.setAttribute("role", "tab");
    const n = sec.groups.flatMap((g) => g.items).filter((i) => !hits || hits.has(itemKey(i))).length;
    const label = el("span", "cat-label", t);
    el("strong", "", label).textContent = sec.title;
    el("small", "", label).textContent = sec.hint;
    el("span", "cat-n", t).textContent = String(n);
    const active = sec.id === currentSec().id;
    t.classList.toggle("active", active);
    t.classList.toggle("empty", n === 0);
    t.setAttribute("aria-selected", String(active));
    t.addEventListener("click", () => {
      currentSection.set(currentWs, sec.id);
      render(board);
    });
  }

  const body = modal.querySelector<HTMLElement>(".cat-body")!;
  body.textContent = "";
  let shown = 0;
  for (const g of currentSec().groups) {
    const items = g.items.filter((i) => !hits || hits.has(itemKey(i)));
    if (!items.length) continue;
    shown += items.length;
    const box = el("section", "cat-group", body);
    el("h4", "", box).textContent = g.title;
    const list = el("div", "cat-list", box);
    for (const i of items) itemNode(board, i, list);
  }
  if (!shown) el("p", "cat-empty", body).textContent = hits ? "Nada en esta sección con esas palabras: mirá las otras pestañas." : "Sección vacía.";
}

/** With a search active, jump to the first worksheet/section that has a hit when the current one has none. */
function followHits(hits: Set<string> | null) {
  if (!hits || hasHit(currentSec(), hits)) return;
  const ordered = [worksheet(currentWs), ...WORKSHEETS.filter((w) => w.id !== currentWs)];
  for (const w of ordered) {
    const sec = w.sections.find((s) => hasHit(s, hits));
    if (sec) {
      currentWs = w.id;
      currentSection.set(w.id, sec.id);
      return;
    }
  }
}

function build(board: BoardView): HTMLElement {
  const m = el("div", "modal cat-modal", document.body);
  m.id = "catalog";
  m.hidden = true;
  m.setAttribute("role", "dialog");
  m.setAttribute("aria-label", "Ejercicios del TP");
  m.addEventListener("click", (ev) => {
    if (ev.target === m) toggle(board, false);
  });
  const card = el("div", "modal-card cat-card", m);
  const head = el("header", "cat-head", card);
  const titles = el("div", "", head);
  el("h3", "", titles).textContent = "Ejercicios del TP";
  el("small", "cat-sub", titles);
  const close = el("button", "cat-close", head);
  close.title = "Cerrar (Esc)";
  close.setAttribute("aria-label", "Cerrar");
  close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  close.addEventListener("click", () => toggle(board, false));

  const bar = el("div", "cat-bar", card);
  const wsTabs = el("div", "cat-wss", bar);
  wsTabs.setAttribute("role", "tablist");
  for (const w of WORKSHEETS) {
    const t = el("button", "cat-ws", wsTabs);
    t.dataset.ws = w.id;
    t.setAttribute("role", "tab");
    t.title = w.title;
    el("strong", "", t).textContent = w.tab;
    el("span", "cat-n", t);
    t.addEventListener("click", () => {
      currentWs = w.id;
      render(board);
    });
  }
  wsTabs.addEventListener("keydown", (ev) => {
    if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
    ev.preventDefault();
    const i = WORKSHEETS.findIndex((w) => w.id === currentWs);
    currentWs = WORKSHEETS[(i + (ev.key === "ArrowRight" ? 1 : WORKSHEETS.length - 1)) % WORKSHEETS.length]!.id;
    render(board);
    wsTabs.querySelector<HTMLElement>(".cat-ws.active")?.focus();
  });

  const search = el("input", "cat-search", bar);
  search.type = "search";
  search.placeholder = "Buscar: 5a, trinomio, ruffini, x^2-36…";
  search.addEventListener("input", () => {
    followHits(hitsOf(search.value));
    render(board);
  });
  search.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") toggle(board, false);
    ev.stopPropagation();
  });

  const layout = el("div", "cat-layout", card);
  const tabs = el("nav", "cat-tabs", layout);
  tabs.setAttribute("role", "tablist");
  tabs.addEventListener("keydown", (ev) => {
    if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
    ev.preventDefault();
    const list = sectionsOfCurrent();
    const i = list.findIndex((s) => s.id === currentSec().id);
    currentSection.set(currentWs, list[(i + (ev.key === "ArrowDown" ? 1 : list.length - 1)) % list.length]!.id);
    render(board);
    tabs.querySelector<HTMLElement>(".cat-tab.active")?.focus();
  });
  el("div", "cat-body", layout);
  return m;
}

function toggle(board: BoardView, open?: boolean) {
  modal ??= build(board);
  const show = open ?? !!modal.hidden;
  modal.hidden = !show;
  document.querySelector("[data-tool=catalog]")?.classList.toggle("active", show);
  if (show) {
    render(board);
    requestAnimationFrame(() => modal!.querySelector<HTMLInputElement>(".cat-search")?.focus({ preventScroll: true }));
  }
}

export function register(board: BoardView) {
  const group = document.querySelector<HTMLElement>(".tools .group");
  if (group && !group.querySelector("[data-tool=catalog]")) {
    const b = el("button", "", group);
    b.dataset.tool = "catalog";
    b.title = `Ejercicios del TP (X) · ${catalogItems().length} ejercicios`;
    b.innerHTML = `${ICON}<span class="label">TP</span>`;
    b.addEventListener("click", () => toggle(board));
  }
  document.addEventListener("keydown", (ev) => {
    const t = ev.target as HTMLElement;
    if (ev.key === "Escape" && modal && !modal.hidden) return toggle(board, false);
    if (t.closest("math-field, textarea, input, select") || board.isEditing() || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key === "x" || ev.key === "X") {
      ev.preventDefault();
      toggle(board);
    }
  });
}
