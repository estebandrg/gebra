// The whiteboard: infinite pan/zoom canvas, keyboard-first math lines (MathLive), step chains
// verified by the CAS, notes, plots, selection, drag, undo and persistence.
import { MathfieldElement } from "mathlive";
import { compareSteps, parseMath, realRoots, type StepCheck } from "../shared/cas";
import { cardLines, cardProgress } from "../shared/cards";
import { checkExerciseStep } from "../shared/exercises";
import { TOOL_LABEL } from "../shared/tools";
import type { Board, CardItem, Exercise, Item, MathItem, NewItem, PlotItem, TextItem, ToolItem, ToolKind, Topic } from "../shared/types";
import { buildPlot } from "./plot";
import { el, renderMath, renderRich, toast } from "./render";

MathfieldElement.fontsDirectory = "/vendor/mathlive/fonts";
MathfieldElement.soundsDirectory = null;

type Listener = () => void;

const TOPIC_LABEL: Record<Topic, string> = {
  lineal: "Ecuación lineal",
  cuadratica: "Cuadrática",
  factorizar: "Factorizar",
  operaciones: "Operaciones",
  division: "División",
};
const LOCK_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

/**
 * Renders a tool widget into `content`. Called on every board render: build the DOM once
 * (e.g. when `content` is empty) and only update it afterwards, so inputs keep focus.
 * Persist state by mutating `item.data` and calling `board.toolChanged(item)`.
 */
export type ToolRenderer = (item: ToolItem, content: HTMLElement, board: BoardView) => void;

/** A button a card offers (Ruffini, quadratic formula, …); tools register themselves here. */
export interface CardAction {
  id: string;
  label: string;
  title: string;
  /** Whether this card should show the action. */
  when: (ex: Exercise) => boolean;
  run: (card: CardItem, ex: Exercise) => void;
}

const stepCache = new Map<string, StepCheck>();
function checkStep(prev: string, cur: string): StepCheck {
  const key = `${prev}\u0000${cur}`;
  let r = stepCache.get(key);
  if (!r) {
    r = compareSteps(prev, cur);
    stepCache.set(key, r);
  }
  return r;
}

export class BoardView {
  board!: Board;
  readonly viewport = document.getElementById("viewport")!;
  readonly world = document.getElementById("world")!;
  private readonly itemsEl = document.getElementById("items")!;
  private readonly elements = new Map<string, HTMLElement>();
  private editing: { id: string; field?: MathfieldElement; area?: HTMLTextAreaElement } | null = null;
  private listeners: Listener[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private temp = new Map<string, string>();
  /** Set while a presentation runs so the board ignores clicks that would edit. */
  locked = false;
  readonly cardActions: CardAction[] = [];
  readonly toolRenderers = new Map<ToolKind, ToolRenderer>();

  onChange(fn: Listener) {
    this.listeners.push(fn);
  }

  private emit() {
    this.listeners.forEach((f) => f());
  }

  // ------------------------------------------------------------ lifecycle

  load(board: Board) {
    this.board = board;
    this.applyView();
    this.renderAll();
    this.bindInput();
    this.emit();
  }

  private snapshot() {
    return JSON.stringify({ items: this.board.items, exercises: this.board.exercises });
  }

  /** Call before a user-visible mutation so it can be undone. */
  checkpoint() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(redo = false) {
    const from = redo ? this.redoStack : this.undoStack;
    const to = redo ? this.undoStack : this.redoStack;
    const snap = from.pop();
    if (!snap) return toast(redo ? "Nada para rehacer" : "Nada para deshacer");
    to.push(this.snapshot());
    const s = JSON.parse(snap);
    this.board.items = s.items;
    this.board.exercises = s.exercises;
    this.board.selection = this.board.selection.filter((id) => this.get(id));
    this.changed();
  }

  changed(save = true) {
    this.renderAll();
    if (save) this.scheduleSave();
    this.emit();
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 350);
  }

  saveNow(keepalive = false) {
    clearTimeout(this.saveTimer);
    return fetch("/api/board", { method: "PUT", body: JSON.stringify(this.board), keepalive }).catch(() =>
      toast("No pude guardar la pizarra (¿servidor apagado?)"),
    );
  }

  // ------------------------------------------------------------ queries

  get(id: string): Item | undefined {
    return this.board.items.find((i) => i.id === id);
  }

  elementFor(id: string): HTMLElement | undefined {
    return this.elements.get(id);
  }

  focusIds(): string[] {
    const ids = [...this.board.selection];
    if (this.editing && !ids.includes(this.editing.id)) ids.push(this.editing.id);
    return ids;
  }

  chainOf(item: Item): MathItem[] {
    if (item.kind !== "math" || !item.chain) return item.kind === "math" ? [item] : [];
    return this.board.items
      .filter((i): i is MathItem => i.kind === "math" && i.chain === item.chain)
      .sort((a, b) => a.y - b.y);
  }

  private nextId(prefix: string) {
    let n = 0;
    for (const i of this.board.items) {
      const m = i.id.match(new RegExp(`^${prefix}(\\d+)$`));
      if (m) n = Math.max(n, Number(m[1]));
    }
    return `${prefix}${n + 1}`;
  }

  /** World-space rectangle of an element (or a sub-element like an \htmlId part). */
  worldRect(node: Element) {
    const r = node.getBoundingClientRect();
    const w = this.world.getBoundingClientRect();
    const z = this.board.view.zoom;
    return { x: (r.left - w.left) / z, y: (r.top - w.top) / z, w: r.width / z, h: r.height / z };
  }

  toWorld(clientX: number, clientY: number) {
    const v = this.board.view;
    const r = this.viewport.getBoundingClientRect();
    return { x: (clientX - r.left - v.x) / v.zoom, y: (clientY - r.top - v.y) / v.zoom };
  }

  viewCenter() {
    const r = this.viewport.getBoundingClientRect();
    return this.toWorld(r.left + r.width * 0.4, r.top + r.height * 0.35);
  }

  // ------------------------------------------------------------ view

  applyView() {
    const v = this.board.view;
    this.world.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
    this.viewport.style.backgroundPosition = `${v.x}px ${v.y}px, ${v.x}px ${v.y}px, 0 0`;
    this.viewport.style.backgroundSize = `auto, ${32 * v.zoom}px ${32 * v.zoom}px, auto`;
    document.getElementById("zoom-label")!.textContent = `${Math.round(v.zoom * 100)}%`;
  }

  zoomAt(factor: number, clientX?: number, clientY?: number) {
    const v = this.board.view;
    const r = this.viewport.getBoundingClientRect();
    const cx = clientX ?? r.left + r.width / 2;
    const cy = clientY ?? r.top + r.height / 2;
    const z = Math.min(3, Math.max(0.25, v.zoom * factor));
    const k = z / v.zoom;
    v.x = cx - r.left - (cx - r.left - v.x) * k;
    v.y = cy - r.top - (cy - r.top - v.y) * k;
    v.zoom = z;
    this.applyView();
    this.scheduleSave();
  }

  /** Smoothly move the camera so the world rect is comfortably visible. */
  async reveal(rect: { x: number; y: number; w: number; h: number }, opts: { center?: boolean; zoom?: number; ms?: number } = {}) {
    const v = this.board.view;
    const vp = this.viewport.getBoundingClientRect();
    const stage = document.getElementById("stage")!;
    const bottomPad = stage.hidden ? 40 : stage.getBoundingClientRect().height + 20;
    const zoom = opts.zoom ?? v.zoom;
    const left = rect.x * zoom;
    const top = rect.y * zoom;
    const visW = vp.width;
    const visH = vp.height - bottomPad;
    let tx = v.x;
    let ty = v.y;
    const margin = 60;
    if (opts.center) {
      tx = visW / 2 - (left + (rect.w * zoom) / 2);
      ty = visH / 2.2 - (top + (rect.h * zoom) / 2);
    } else {
      if (left + v.x < margin) tx = margin - left;
      else if (left + rect.w * zoom + v.x > visW - margin) tx = Math.max(visW - margin - rect.w * zoom - left, margin - left);
      if (top + v.y < margin) ty = margin - top;
      else if (top + rect.h * zoom + v.y > visH - margin) ty = Math.max(visH - margin - rect.h * zoom - top, margin - top);
    }
    if (tx === v.x && ty === v.y && zoom === v.zoom) return;
    const from = { ...v };
    const ms = opts.ms ?? 600;
    if (ms <= 0) {
      Object.assign(v, { x: tx, y: ty, zoom });
      this.applyView();
      return this.scheduleSave();
    }
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / ms);
        const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        v.x = from.x + (tx - from.x) * e;
        v.y = from.y + (ty - from.y) * e;
        v.zoom = from.zoom + (zoom - from.zoom) * e;
        this.applyView();
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    this.scheduleSave();
  }

  // ------------------------------------------------------------ rendering

  renderAll() {
    const alive = new Set(this.board.items.map((i) => i.id));
    for (const [id, node] of this.elements)
      if (!alive.has(id)) {
        node.remove();
        this.elements.delete(id);
      }
    // cards first so their lines have a body to live in
    for (const item of this.board.items) if (item.kind === "card") this.renderItem(item);
    for (const item of this.board.items) if (item.kind !== "card") this.renderItem(item);
    document.getElementById("empty-hint")!.hidden = this.board.items.length > 0;
  }

  /** Card body for a card line, the free board otherwise. */
  private hostFor(item: Item): HTMLElement {
    if ((item.kind !== "math" && item.kind !== "tool") || !item.card) return this.itemsEl;
    return this.elements.get(item.card)?.querySelector<HTMLElement>(".card-body") ?? this.itemsEl;
  }

  /** Insert a card line's node at its step position (board order) without moving other nodes. */
  private placeInCard(item: MathItem | ToolItem, node: HTMLElement, body: HTMLElement) {
    const order = this.board.items.filter((i) => (i.kind === "math" || i.kind === "tool") && i.card === item.card);
    const after = order.slice(order.findIndex((l) => l.id === item.id) + 1);
    const next = after.map((l) => this.elements.get(l.id)).find((n) => n?.parentElement === body);
    body.insertBefore(node, next ?? null);
  }

  private renderItem(item: Item) {
    let node = this.elements.get(item.id);
    const host = this.hostFor(item);
    const inCard = host !== this.itemsEl;
    if (!node) {
      node = el("div", `item ${item.kind}`);
      node.dataset.id = item.id;
      const handle = el("div", "handle", node);
      handle.textContent = "⋮⋮";
      handle.title = "Arrastrar";
      const del = el("button", "del", node);
      del.textContent = "✕";
      del.title = "Borrar";
      del.addEventListener("pointerdown", (e) => e.stopPropagation());
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        this.remove([item.id]);
      });
      if (item.kind === "card") this.buildCard(item, node);
      else el("div", "content", node);
      this.elements.set(item.id, node);
    }
    if (node.parentElement !== host) {
      if (inCard) this.placeInCard(item as MathItem | ToolItem, node, host);
      else host.appendChild(node);
    }
    node.classList.toggle("in-card", inCard);
    node.style.left = inCard ? "" : `${item.x}px`;
    node.style.top = inCard ? "" : `${item.y}px`;
    node.classList.toggle("selected", this.board.selection.includes(item.id));
    if (this.editing?.id === item.id) return;

    const content = node.querySelector<HTMLElement>(".content")!;
    node.querySelector(":scope > .badge")?.remove();
    if (item.kind === "math") {
      const latex = this.temp.get(item.id) ?? item.latex;
      renderMath(content, latex);
      const parsed = parseMath(item.latex);
      node.classList.toggle("invalid", parsed.kind === "invalid");
      node.title = parsed.kind === "invalid" ? `No lo entiendo: ${parsed.error}` : "";
      const head = !item.card && this.board.exercises.find((e) => e.id === item.exercise && this.chainOf(item)[0]?.id === item.id);
      node.classList.toggle("exercise-head-line", !!head);
      this.renderBadge(item, node);
    } else if (item.kind === "text") {
      renderRich(content, item.text);
      node.className = `item text${item.color ? ` c-${item.color}` : ""}${this.board.selection.includes(item.id) ? " selected" : ""}`;
    } else if (item.kind === "card") {
      this.renderCard(item, node, content);
    } else if (item.kind === "tool") {
      if (!content.dataset.tool) {
        content.dataset.tool = item.tool;
        const head = el("div", "tool-title", node);
        head.textContent = TOOL_LABEL[item.tool];
        node.insertBefore(head, content);
      }
      this.toolRenderers.get(item.tool)?.(item, content, this);
    } else {
      const sig = JSON.stringify([item.exprs, item.xRange, item.yRange, item.marks, item.w, item.h]);
      if (content.dataset.sig !== sig) {
        content.textContent = "";
        content.appendChild(buildPlot(item).svg);
        content.dataset.sig = sig;
      }
    }
  }

  private renderBadge(item: MathItem, node: HTMLElement) {
    if (item.card) return this.renderCardLineBadge(item, node);
    const chain = this.chainOf(item);
    const idx = chain.findIndex((i) => i.id === item.id);
    const ex = this.board.exercises.find((e) => e.id === item.exercise);
    const badge = (cls: string, text: string, title: string) => {
      const b = el("span", `badge ${cls}`, node);
      b.textContent = text;
      b.title = title;
    };
    if (ex && idx === chain.length - 1 && idx > 0) {
      const p = checkExerciseStep(ex, item.latex);
      if (p.status === "solved") {
        badge("solved", "¡Resuelto! 🎉", p.reason);
        if (!ex.solved) {
          ex.solved = true;
          toast("¡Ejercicio resuelto! 🎉");
          this.scheduleSave();
        }
        return;
      }
    }
    if (idx <= 0) return;
    const r = checkStep(chain[idx - 1]!.latex, item.latex);
    if (r.status === "equivalent") badge("ok", "✓", r.reason);
    else if (r.status === "different") badge("bad", "✗ revisá este paso", r.reason);
    else if (item.latex.trim()) badge("unk", "?", r.reason);
  }

  private renderCardLineBadge(item: MathItem, node: HTMLElement) {
    const card = this.get(item.card!);
    if (card?.kind !== "card") return;
    const p = cardProgress(this.board, card, checkStep);
    const line = p.lines.find((l) => l.id === item.id);
    const b = (cls: string, text: string, title: string) => {
      const span = el("span", `badge ${cls}`, node);
      span.textContent = text;
      span.title = title;
    };
    if (p.status === "solved" && p.lines.at(-1)?.id === item.id) return b("solved", "¡Resuelto!", p.reason);
    const r = line?.check;
    if (!r) return;
    if (r.status === "equivalent") b("ok", "✓", r.reason);
    else if (r.status === "different") b("bad", "✗ revisá", r.reason);
    else b("unk", "?", r.reason);
  }

  // ------------------------------------------------------------ cards

  private buildCard(card: CardItem, node: HTMLElement) {
    const head = el("div", "card-head", node);
    const kicker = el("div", "card-kicker", head);
    kicker.innerHTML = LOCK_ICON;
    el("span", "card-prompt", kicker);
    el("span", "card-meta", kicker);
    el("div", "content", head);
    el("div", "card-body", node);
    const foot = el("div", "card-foot", node);
    el("div", "card-status", foot);
    el("div", "card-actions", foot);
    const grip = el("div", "resize", node);
    grip.title = "Arrastrá para cambiar el tamaño · doble clic: tamaño automático";
    node.title = "";
    node.dataset.cardId = card.id;
  }

  private renderCard(card: CardItem, node: HTMLElement, content: HTMLElement) {
    node.style.width = card.w ? `${card.w}px` : "";
    node.style.height = card.h ? `${card.h}px` : "";
    node.classList.toggle("sized", !!(card.w || card.h));
    const ex = this.board.exercises.find((e) => e.id === card.exercise);
    node.querySelector<HTMLElement>(".card-prompt")!.textContent = ex ? `${ex.prompt}` : "Ejercicio";
    node.querySelector<HTMLElement>(".card-meta")!.textContent = ex ? `${TOPIC_LABEL[ex.topic] ?? ex.topic} · nivel ${ex.level}` : "";
    renderMath(content, this.temp.get(card.id) ?? ex?.latex ?? "");
    content.title = "Enunciado (fijo): trabajá en los pasos de abajo";
    const p = cardProgress(this.board, card, checkStep);
    node.classList.toggle("solved", p.status === "solved");
    node.classList.toggle("has-error", p.lines.some((l) => l.check?.status === "different"));
    const status = node.querySelector<HTMLElement>(".card-status")!;
    status.className = `card-status s-${p.status}`;
    status.textContent =
      p.status === "solved"
        ? "¡Resuelto! 🎉"
        : p.status === "empty"
          ? ex?.kind === "divide"
            ? "Escribí C = …, R = … o usá Ruffini"
            : "Escribí el primer paso"
          : p.lines.some((l) => l.check?.status === "different")
            ? "Hay un paso para revisar"
            : `${p.lines.length} paso${p.lines.length === 1 ? "" : "s"} · ${p.reason || "seguí"}`;
    if (ex && p.status === "solved" && !ex.solved) {
      ex.solved = true;
      toast("¡Ejercicio resuelto! 🎉");
      this.scheduleSave();
    }
    const actions = node.querySelector<HTMLElement>(".card-actions")!;
    const wanted = ex ? this.cardActions.filter((a) => a.when(ex)) : [];
    const sig = wanted.map((a) => a.id).join(",");
    if (actions.dataset.sig !== sig || !actions.childElementCount) {
      actions.dataset.sig = sig;
      actions.textContent = "";
      const add = el("button", "card-btn primary", actions);
      add.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Paso';
      add.title = "Agregar un paso de trabajo";
      add.addEventListener("click", () => this.addCardStep(card.id));
      for (const a of wanted) {
        const b = el("button", "card-btn", actions);
        b.textContent = a.label;
        b.title = a.title;
        b.addEventListener("click", () => {
          const cur = this.get(card.id);
          const e = cur?.kind === "card" ? this.board.exercises.find((x) => x.id === cur.exercise) : undefined;
          if (cur?.kind === "card" && e) a.run(cur, e);
        });
      }
      actions.querySelectorAll("button").forEach((b) => b.addEventListener("pointerdown", (e) => e.stopPropagation()));
    }
  }

  /** Add a tool (inside a card when `card` is given) and return it. */
  addTool(tool: ToolKind, data: Record<string, unknown>, card?: string): ToolItem {
    this.checkpoint();
    const host = card ? this.get(card) : undefined;
    const spot = host ? { x: host.x, y: host.y } : this.freeSpot(420, 220);
    const item: ToolItem = { id: this.nextId("w"), kind: "tool", x: spot.x, y: spot.y, tool, data, ...(host ? { card } : {}) };
    this.board.items.push(item);
    this.board.selection = [item.id];
    this.changed();
    const node = this.elementFor(item.id);
    if (node) void this.reveal(this.worldRect(card ? (this.elementFor(card) ?? node) : node));
    return item;
  }

  /** A tool mutated its `data`: save (with undo) without rebuilding its DOM. */
  toolChanged(_item: ToolItem) {
    this.changed();
  }

  /** Add a work line at the end of a card, prefilled with the last line (or the statement). */
  addCardStep(cardId: string, latex?: string, edit = true): MathItem | undefined {
    const card = this.get(cardId);
    if (card?.kind !== "card") return;
    const ex = this.board.exercises.find((e) => e.id === card.exercise);
    const last = cardLines(this.board, cardId).filter((l) => l.latex.trim()).at(-1);
    const prefill = latex ?? last?.latex ?? (ex && ex.kind !== "divide" ? ex.latex : "");
    const line = this.addMath(card.x, card.y, prefill, { card: cardId, exercise: card.exercise }, edit);
    const node = this.elementFor(line.id);
    if (node) void this.reveal(this.worldRect(this.elementFor(cardId) ?? node));
    return line;
  }

  /** Temporarily render an item with other LaTeX (used by presentations to mark parts). */
  renderTemp(id: string, latex: string) {
    this.temp.set(id, latex);
    const item = this.get(id);
    if (item) this.renderItem(item);
  }

  restoreTemp() {
    const ids = [...this.temp.keys()];
    this.temp.clear();
    for (const id of ids) {
      const item = this.get(id);
      if (item) this.renderItem(item);
    }
    this.elements.forEach((n) => n.classList.remove("dimmed"));
  }

  // ------------------------------------------------------------ mutations

  select(ids: string[], add = false) {
    this.board.selection = add ? [...new Set([...this.board.selection, ...ids])] : ids;
    this.renderAll();
    this.scheduleSave();
    this.emit();
  }

  remove(ids: string[]) {
    if (!ids.length) return;
    const cardIds = new Set(ids.filter((id) => this.get(id)?.kind === "card"));
    ids = [...ids, ...this.board.items.filter((i) => (i.kind === "math" || i.kind === "tool") && i.card && cardIds.has(i.card)).map((i) => i.id)];
    this.checkpoint();
    if (this.editing && ids.includes(this.editing.id)) this.editing = null;
    this.board.items = this.board.items.filter((i) => !ids.includes(i.id));
    this.board.selection = this.board.selection.filter((i) => !ids.includes(i));
    const used = new Set(this.board.items.map((i) => (i.kind === "math" || i.kind === "card" ? i.exercise : undefined)));
    this.board.exercises = this.board.exercises.filter((e) => used.has(e.id));
    this.changed();
  }

  clearAll() {
    if (!this.board.items.length) return;
    if (!confirm("¿Borrar toda la pizarra? (Ctrl+Z la recupera)")) return;
    this.checkpoint();
    this.editing = null;
    this.board.items = [];
    this.board.exercises = [];
    this.board.selection = [];
    this.changed();
  }

  addMath(x: number, y: number, latex = "", extra: Partial<MathItem> = {}, edit = true, index?: number): MathItem {
    this.checkpoint();
    const item: MathItem = { id: this.nextId("m"), kind: "math", x, y, latex, ...extra };
    if (index === undefined) this.board.items.push(item);
    else this.board.items.splice(index, 0, item);
    this.board.selection = [item.id];
    this.changed();
    if (edit) this.startEdit(item.id);
    return item;
  }

  addText(x: number, y: number, text = "", extra: Partial<TextItem> = {}, edit = true): TextItem {
    this.checkpoint();
    const item: TextItem = { id: this.nextId("t"), kind: "text", x, y, text, ...extra };
    this.board.items.push(item);
    this.board.selection = [item.id];
    this.changed();
    if (edit) this.startEdit(item.id);
    return item;
  }

  addPlot(spec: Omit<PlotItem, "id" | "kind">): PlotItem {
    this.checkpoint();
    const item: PlotItem = { id: this.nextId("g"), kind: "plot", ...spec };
    this.board.items.push(item);
    this.board.selection = [item.id];
    this.changed();
    return item;
  }

  /** Copy presentation results into the board as real items. */
  addItems(items: NewItem[]) {
    this.checkpoint();
    for (const it of items) {
      const prefix = it.kind === "math" ? "m" : it.kind === "text" ? "t" : "g";
      this.board.items.push({ ...it, id: this.nextId(prefix) } as Item);
    }
    this.changed();
  }

  /** World rects of every rendered board item (badges excluded). */
  obstacles(): { x: number; y: number; w: number; h: number }[] {
    return [...this.elements.values()].map((n) => this.worldRect(n));
  }

  /** First non-overlapping spot for a w×h box starting at (x, y), moving down (or right). */
  findFree(x: number, y: number, w: number, h: number, extra: { x: number; y: number; w: number; h: number }[] = [], dir: "down" | "right" = "down") {
    const obs = [...this.obstacles(), ...extra];
    const gap = 14;
    for (let i = 0; i < 60; i++) {
      const hit = obs.find((r) => x < r.x + r.w + gap && x + w + gap > r.x && y < r.y + r.h + gap && y + h + gap > r.y);
      if (!hit) break;
      if (dir === "right") x = hit.x + hit.w + gap * 2;
      else y = hit.y + hit.h + gap;
    }
    return { x, y };
  }

  /** Place new content below the selection (or near the view center) without covering anything. */
  freeSpot(w = 360, h = 60): { x: number; y: number } {
    const sel = this.board.selection.map((id) => this.get(id)).filter(Boolean) as Item[];
    const anchor = sel.at(-1);
    let start = this.viewCenter();
    if (anchor) {
      const r = this.elementFor(anchor.id) ? this.worldRect(this.elementFor(anchor.id)!) : { x: anchor.x, y: anchor.y, w: 0, h: 50 };
      start = { x: anchor.x, y: r.y + r.h + 40 };
    }
    const p = this.findFree(start.x, start.y, w, h);
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }

  /** Put an exercise on the board as a card: fixed statement on top, work lines inside. */
  addExercise(ex: Exercise): MathItem | undefined {
    const spot = this.freeSpot(480, 220);
    this.checkpoint();
    this.board.exercises.push(ex);
    const card: CardItem = { id: this.nextId("c"), kind: "card", x: spot.x, y: spot.y, exercise: ex.id };
    this.board.items.push(card);
    this.board.selection = [card.id];
    this.changed();
    void this.reveal({ x: spot.x, y: spot.y, w: 520, h: 260 });
    if (ex.kind === "divide") return;
    return this.addCardStep(card.id);
  }

  plotSelection() {
    const sources = this.focusIds()
      .map((id) => this.get(id))
      .filter((i): i is MathItem => i?.kind === "math" && i.latex.trim() !== "");
    if (!sources.length) return toast("Seleccioná una ecuación o expresión para graficar");
    const exprs = sources.map((s) => s.latex);
    let roots: number[] = [];
    for (const s of exprs) {
      try {
        const p = parseMath(s);
        if (p.kind === "equation" || p.kind === "expression") {
          if ((p.kind === "expression" ? p.vars : p.vars).some((v) => v !== "x" && v !== "y")) {
            return toast("Por ahora grafico expresiones en x (y = f(x))");
          }
          roots.push(...realRoots(s.replace(/^\s*y\s*=/, "")));
        }
      } catch {
        /* no roots */
      }
    }
    roots = roots.filter(Number.isFinite);
    const lo = roots.length ? Math.min(...roots) : 0;
    const hi = roots.length ? Math.max(...roots) : 0;
    const span = Math.max(8, hi - lo + 6);
    const mid = (lo + hi) / 2;
    const xRange: [number, number] = [Math.floor(mid - span / 2), Math.ceil(mid + span / 2)];
    const rightmost = sources.reduce((acc, s) => {
      const r = this.worldRect(this.elementFor(s.id)!);
      return Math.max(acc, r.x + r.w);
    }, -Infinity);
    const top = Math.min(...sources.map((s) => s.y));
    const spot = this.findFree(rightmost + 120, top, 460, 340, [], "right");
    this.addPlot({ x: Math.round(spot.x), y: Math.round(spot.y), w: 440, h: 320, exprs, xRange });
  }

  // ------------------------------------------------------------ editing

  isEditing() {
    return !!this.editing;
  }

  startEdit(id: string) {
    const item = this.get(id);
    const node = this.elementFor(id);
    if (!item || !node || this.locked) return;
    if (this.editing?.id === id) return;
    if (item.kind === "card" || item.kind === "plot") return;
    this.commitEdit();
    const content = node.querySelector<HTMLElement>(".content")!;
    node.querySelector(":scope > .badge")?.remove();
    node.classList.add("editing");
    content.textContent = "";

    if (item.kind === "math") {
      const head = this.chainOf(item)[0];
      if (item.exercise && !item.card && head?.id === item.id) {
        node.classList.remove("editing");
        this.renderItem(item);
        return toast("Ese es el enunciado; trabajá en la línea de abajo");
      }
      const mf = new MathfieldElement();
      content.appendChild(mf);
      mf.smartFence = true;
      mf.mathVirtualKeyboardPolicy = "manual";
      mf.value = item.latex;
      try {
        mf.menuItems = [];
      } catch {
        /* older MathLive: menu stays */
      }
      this.editing = { id, field: mf };
      mf.addEventListener(
        "keydown",
        (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            if (e.shiftKey || e.ctrlKey) this.commitEdit();
            else this.nextStep();
          } else if (e.key === "Escape") {
            e.preventDefault();
            this.commitEdit();
          }
        },
        { capture: true },
      );
      mf.addEventListener("focusout", () => setTimeout(() => this.editing?.field === mf && !mf.hasFocus() && this.commitEdit(), 120));
      requestAnimationFrame(() => {
        mf.focus();
        mf.executeCommand("moveToMathfieldEnd");
      });
    } else if (item.kind === "text") {
      const area = el("textarea", "", content);
      area.value = item.text;
      area.rows = Math.max(1, item.text.split("\n").length);
      area.placeholder = "Escribí una nota ($x^2$ para matemática)";
      this.editing = { id, area };
      area.addEventListener("input", () => (area.rows = Math.max(1, area.value.split("\n").length)));
      area.addEventListener("keydown", (e) => {
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          this.commitEdit();
        }
        e.stopPropagation();
      });
      area.addEventListener("blur", () => setTimeout(() => this.editing?.area === area && this.commitEdit(), 120));
      requestAnimationFrame(() => area.focus());
    }
    this.board.selection = [id];
    this.elements.forEach((n, nid) => n.classList.toggle("selected", nid === id));
    this.emit();
  }

  commitEdit() {
    const ed = this.editing;
    if (!ed) return;
    this.editing = null;
    const item = this.get(ed.id);
    this.elementFor(ed.id)?.classList.remove("editing");
    if (!item) return;
    const value = ed.field ? ed.field.value.trim() : (ed.area?.value ?? "").trim();
    const old = item.kind === "math" ? item.latex : item.kind === "text" ? item.text : "";
    if (!value) {
      this.board.items = this.board.items.filter((i) => i.id !== item.id);
      this.board.selection = this.board.selection.filter((i) => i !== item.id);
    } else if (value !== old) {
      this.undoStack.push(JSON.stringify({ items: this.board.items.map((i) => (i.id === item.id ? { ...i } : i)), exercises: this.board.exercises }));
      if (item.kind === "math") item.latex = value;
      if (item.kind === "text") item.text = value;
    }
    this.changed();
  }

  /** Enter: finish this line and start the next step of the chain below, prefilled. */
  nextStep() {
    const ed = this.editing;
    if (!ed?.field) return;
    const item = this.get(ed.id) as MathItem;
    const latex = ed.field.value.trim();
    if (!latex) return this.commitEdit();
    if (item.card) {
      this.commitEdit();
      const index = this.board.items.indexOf(item) + 1;
      const next = this.addMath(item.x, item.y, latex, { card: item.card, exercise: item.exercise }, true, index);
      void this.reveal(this.worldRect(this.elementFor(item.card) ?? this.elementFor(next.id)!));
      return;
    }
    if (!item.chain) item.chain = item.id;
    this.commitEdit();
    const node = this.elementFor(item.id)!;
    const r = this.worldRect(node);
    // push down anything right below to make room
    const y = r.y + r.h + 10;
    const below = this.board.items.filter((i) => i.id !== item.id && i.y >= y - 4 && i.y < y + 70 && Math.abs(i.x - item.x) < 400);
    for (const b of below) b.y += 70;
    const next = this.addMath(item.x, y, latex, { chain: item.chain, exercise: item.exercise });
    void this.reveal(this.worldRect(this.elementFor(next.id)!));
  }

  // ------------------------------------------------------------ input

  private bound = false;
  private bindInput() {
    if (this.bound) return;
    this.bound = true;
    const vp = this.viewport;
    let pan: { x: number; y: number; vx: number; vy: number; moved: boolean } | null = null;
    let drag: { ids: string[]; start: { x: number; y: number }; orig: Map<string, { x: number; y: number }>; moved: boolean } | null = null;
    let resize: { id: string; start: { x: number; y: number }; w: number; h: number; moved: boolean } | null = null;

    vp.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      const target = e.target as HTMLElement;
      const itemEl = target.closest<HTMLElement>(".item");
      if (itemEl && e.button === 0) {
        const id = itemEl.dataset.id!;
        const item = this.get(id)!;
        const onHandle = !!target.closest(".handle");
        if (target.closest(".resize") && item.kind === "card") {
          e.preventDefault();
          const r = this.worldRect(itemEl);
          resize = { id, start: this.toWorld(e.clientX, e.clientY), w: r.w, h: r.h, moved: false };
          vp.setPointerCapture(e.pointerId);
          return;
        }
        if (target.closest("math-field, textarea, input, select, button, .card-actions")) return;
        if (item.kind === "tool" && item.card && !onHandle) return;
        if (e.shiftKey) {
          e.preventDefault();
          const sel = this.board.selection.includes(id) ? this.board.selection.filter((s) => s !== id) : [...this.board.selection, id];
          this.commitEdit();
          return this.select(sel);
        }
        if (onHandle || item.kind === "plot" || item.kind === "card" || item.kind === "tool") {
          e.preventDefault();
          if (!this.board.selection.includes(id)) this.select([id]);
          const ids = this.board.selection.filter((i) => {
            const it = this.get(i);
            return !((it?.kind === "math" || it?.kind === "tool") && it.card);
          });
          const orig = new Map(ids.map((i) => [i, { x: this.get(i)!.x, y: this.get(i)!.y }]));
          drag = { ids, start: this.toWorld(e.clientX, e.clientY), orig, moved: false };
          vp.setPointerCapture(e.pointerId);
          return;
        }
        e.preventDefault();
        if (this.locked) return this.select([id]);
        this.startEdit(id);
        return;
      }
      if (target.closest(".pres-layer")) return;
      pan = { x: e.clientX, y: e.clientY, vx: this.board.view.x, vy: this.board.view.y, moved: false };
      vp.setPointerCapture(e.pointerId);
    });

    vp.addEventListener("pointermove", (e) => {
      if (resize) {
        const p = this.toWorld(e.clientX, e.clientY);
        const card = this.get(resize.id);
        if (card?.kind !== "card") return;
        if (!resize.moved) {
          resize.moved = true;
          this.checkpoint();
        }
        card.w = Math.round(Math.max(360, resize.w + p.x - resize.start.x));
        card.h = Math.round(Math.max(170, resize.h + p.y - resize.start.y));
        const node = this.elementFor(card.id)!;
        node.style.width = `${card.w}px`;
        node.style.height = `${card.h}px`;
        node.classList.add("sized");
      } else if (drag) {
        const p = this.toWorld(e.clientX, e.clientY);
        const dx = p.x - drag.start.x;
        const dy = p.y - drag.start.y;
        if (!drag.moved && Math.hypot(dx, dy) > 3) {
          drag.moved = true;
          this.checkpoint();
        }
        for (const id of drag.ids) {
          const it = this.get(id);
          const o = drag.orig.get(id);
          if (!it || !o) continue;
          it.x = Math.round(o.x + dx);
          it.y = Math.round(o.y + dy);
          const node = this.elementFor(id)!;
          node.style.left = `${it.x}px`;
          node.style.top = `${it.y}px`;
        }
      } else if (pan) {
        const dx = e.clientX - pan.x;
        const dy = e.clientY - pan.y;
        if (Math.hypot(dx, dy) > 3) {
          pan.moved = true;
          vp.classList.add("panning");
        }
        this.board.view.x = pan.vx + dx;
        this.board.view.y = pan.vy + dy;
        this.applyView();
      }
    });

    const end = () => {
      if (resize) {
        if (resize.moved) this.changed();
        resize = null;
      }
      if (drag) {
        if (drag.moved) this.changed();
        drag = null;
      }
      if (pan) {
        vp.classList.remove("panning");
        if (!pan.moved) {
          this.commitEdit();
          if (this.board.selection.length) this.select([]);
        } else this.scheduleSave();
        pan = null;
      }
    };
    vp.addEventListener("pointerup", end);
    vp.addEventListener("pointercancel", end);

    vp.addEventListener("dblclick", (e) => {
      const grip = (e.target as HTMLElement).closest(".resize");
      const cardEl = grip?.closest<HTMLElement>(".item.card");
      const card = cardEl ? this.get(cardEl.dataset.id!) : undefined;
      if (card?.kind === "card") {
        this.checkpoint();
        delete card.w;
        delete card.h;
        return this.changed();
      }
      if ((e.target as HTMLElement).closest(".item") || this.locked) return;
      const p = this.toWorld(e.clientX, e.clientY);
      this.addMath(Math.round(p.x), Math.round(p.y - 24));
    });

    vp.addEventListener(
      "wheel",
      (e) => {
        if ((e.target as HTMLElement).closest("math-field")) return;
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) this.zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY);
        else {
          this.board.view.x -= e.deltaX;
          this.board.view.y -= e.deltaY;
          this.applyView();
          this.scheduleSave();
        }
      },
      { passive: false },
    );

    window.addEventListener("beforeunload", () => void this.saveNow(true));
  }
}
