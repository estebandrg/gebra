// Exercises modal: the TP2 worksheet split into sections; any exercise goes onto the board as a card.
import "./catalog.css";
import { CATALOG, catalogExercise, catalogItems, onBoard, searchCatalog, type CatalogItem } from "../../shared/catalog";
import type { BoardView } from "../board";
import { el, renderMath, toast } from "../render";

const ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6"/></svg>';

let modal: HTMLElement | null = null;
let current = CATALOG[0]!.id;

function hasHit(sec: (typeof CATALOG)[number], hits: Set<string> | null): boolean {
  return sec.groups.some((g) => g.items.some((i) => !hits || hits.has(i.id)));
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
    toast(`Puse el ${item.id} en la pizarra`);
  });
}

function render(board: BoardView) {
  if (!modal) return;
  const query = modal.querySelector<HTMLInputElement>(".cat-search")!.value;
  const hits = query.trim() ? new Set(searchCatalog(query).map((i) => i.id)) : null;

  modal.querySelectorAll<HTMLButtonElement>(".cat-tab").forEach((tab) => {
    const sec = CATALOG.find((s) => s.id === tab.dataset.id)!;
    const n = sec.groups.flatMap((g) => g.items).filter((i) => !hits || hits.has(i.id)).length;
    tab.querySelector(".cat-n")!.textContent = String(n);
    tab.classList.toggle("empty", n === 0);
    tab.classList.toggle("active", tab.dataset.id === current);
    tab.setAttribute("aria-selected", String(tab.dataset.id === current));
  });

  const body = modal.querySelector<HTMLElement>(".cat-body")!;
  body.textContent = "";
  const sec = CATALOG.find((s) => s.id === current)!;
  let shown = 0;
  for (const g of sec.groups) {
    const items = g.items.filter((i) => !hits || hits.has(i.id));
    if (!items.length) continue;
    shown += items.length;
    const box = el("section", "cat-group", body);
    el("h4", "", box).textContent = g.title;
    const list = el("div", "cat-list", box);
    for (const i of items) itemNode(board, i, list);
  }
  if (!shown) el("p", "cat-empty", body).textContent = hits ? "Nada en esta sección con esas palabras: mirá las otras pestañas." : "Sección vacía.";
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
  el("small", "", titles).textContent = "TP 2 · Ecuaciones y Factorización — Matemática 2 (UNRN)";
  const close = el("button", "cat-close", head);
  close.title = "Cerrar (Esc)";
  close.setAttribute("aria-label", "Cerrar");
  close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  close.addEventListener("click", () => toggle(board, false));

  const search = el("input", "cat-search", card);
  search.type = "search";
  search.placeholder = "Buscar: 5a, trinomio, x^2-36…";
  search.addEventListener("input", () => {
    // jump to the first section that has a hit so the list is never empty by accident
    const hits = search.value.trim() ? new Set(searchCatalog(search.value).map((i) => i.id)) : null;
    if (hits && !hasHit(CATALOG.find((s) => s.id === current)!, hits)) {
      const first = CATALOG.find((s) => hasHit(s, hits));
      if (first) current = first.id;
    }
    render(board);
  });
  search.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") toggle(board, false);
    ev.stopPropagation();
  });

  const layout = el("div", "cat-layout", card);
  const tabs = el("nav", "cat-tabs", layout);
  tabs.setAttribute("role", "tablist");
  for (const sec of CATALOG) {
    const t = el("button", "cat-tab", tabs);
    t.dataset.id = sec.id;
    t.setAttribute("role", "tab");
    const label = el("span", "cat-label", t);
    el("strong", "", label).textContent = sec.title;
    el("small", "", label).textContent = sec.hint;
    el("span", "cat-n", t);
    t.addEventListener("click", () => {
      current = sec.id;
      render(board);
    });
  }
  tabs.addEventListener("keydown", (ev) => {
    if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
    ev.preventDefault();
    const i = CATALOG.findIndex((s) => s.id === current);
    current = CATALOG[(i + (ev.key === "ArrowDown" ? 1 : CATALOG.length - 1)) % CATALOG.length]!.id;
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
