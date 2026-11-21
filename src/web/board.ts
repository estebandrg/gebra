// The whiteboard: infinite pan/zoom canvas, keyboard-first math lines (MathLive), step chains
// verified by the CAS, notes, plots, selection, drag, undo and persistence.
import { MathfieldElement } from "mathlive";
import { compareSteps, parseMath, realRoots, type StepCheck } from "../shared/cas";
import { checkExerciseStep } from "../shared/exercises";
import type { Board, Exercise, Item, MathItem, NewItem, PlotItem, TextItem } from "../shared/types";
import { buildPlot } from "./plot";
import { el, renderMath, renderRich, toast } from "./render";

MathfieldElement.fontsDirectory = "/vendor/mathlive/fonts";
MathfieldElement.soundsDirectory = null;

type Listener = () => void;

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
    for (const item of this.board.items) this.renderItem(item);
    document.getElementById("empty-hint")!.hidden = this.board.items.length > 0;
  }

  private renderItem(item: Item) {
    let node = this.elements.get(item.id);
    if (!node) {
      node = el("div", `item ${item.kind}`, this.itemsEl);
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
      el("div", "content", node);
      this.elements.set(item.id, node);
    }
    node.style.left = `${item.x}px`;
    node.style.top = `${item.y}px`;
    node.classList.toggle("selected", this.board.selection.includes(item.id));
    if (this.editing?.id === item.id) return;

    const content = node.querySelector<HTMLElement>(".content")!;
    node.querySelector(".badge")?.remove();
    if (item.kind === "math") {
      const latex = this.temp.get(item.id) ?? item.latex;
      renderMath(content, latex);
      const parsed = parseMath(item.latex);
      node.classList.toggle("invalid", parsed.kind === "invalid");
      node.title = parsed.kind === "invalid" ? `No lo entiendo: ${parsed.error}` : "";
      const head = this.board.exercises.find((e) => e.id === item.exercise && this.chainOf(item)[0]?.id === item.id);
      node.classList.toggle("exercise-head-line", !!head);
      this.renderBadge(item, node);
    } else if (item.kind === "text") {
      renderRich(content, item.text);
      node.className = `item text${item.color ? ` c-${item.color}` : ""}${this.board.selection.includes(item.id) ? " selected" : ""}`;
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
    this.checkpoint();
    if (this.editing && ids.includes(this.editing.id)) this.editing = null;
    this.board.items = this.board.items.filter((i) => !ids.includes(i.id));
    this.board.selection = this.board.selection.filter((i) => !ids.includes(i));
    const used = new Set(this.board.items.map((i) => (i.kind === "math" ? i.exercise : undefined)));
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

  addMath(x: number, y: number, latex = "", extra: Partial<MathItem> = {}, edit = true): MathItem {
    this.checkpoint();
    const item: MathItem = { id: this.nextId("m"), kind: "math", x, y, latex, ...extra };
    this.board.items.push(item);
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

  /** Place a position below everything currently near the view, for new content. */
  freeSpot(): { x: number; y: number } {
    const sel = this.board.selection.map((id) => this.get(id)).filter(Boolean) as Item[];
    const anchor = sel.at(-1);
    if (anchor) {
      const r = this.elementFor(anchor.id) ? this.worldRect(this.elementFor(anchor.id)!) : { x: anchor.x, y: anchor.y, w: 0, h: 50 };
      return { x: anchor.x, y: r.y + r.h + 40 };
    }
    return this.viewCenter();
  }

  addExercise(ex: Exercise) {
    const spot = this.freeSpot();
    this.checkpoint();
    this.board.exercises.push(ex);
    const textId = this.nextId("t");
    this.board.items.push({ id: textId, kind: "text", x: spot.x, y: spot.y, text: `${ex.prompt}:`, color: "yellow" });
    const headId = this.nextId("m");
    this.board.items.push({ id: headId, kind: "math", x: spot.x, y: spot.y + 48, latex: ex.latex, chain: headId, exercise: ex.id });
    this.changed();
    const headEl = this.elementFor(headId)!;
    const r = this.worldRect(headEl);
    const step = this.addMath(spot.x, r.y + r.h + 14, ex.kind === "divide" ? "" : ex.latex, { chain: headId, exercise: ex.id });
    void this.reveal({ x: spot.x, y: spot.y, w: 500, h: 220 });
    return step;
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
    this.addPlot({ x: rightmost + 120, y: top, w: 440, h: 320, exprs, xRange });
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
    this.commitEdit();
    const content = node.querySelector<HTMLElement>(".content")!;
    node.querySelector(".badge")?.remove();
    node.classList.add("editing");
    content.textContent = "";

    if (item.kind === "math") {
      const head = this.chainOf(item)[0];
      if (item.exercise && head?.id === item.id) {
        node.classList.remove("editing");
        this.renderItem(item);
        return toast("Ese es el enunciado; trabajá en la línea de abajo");
      }
      const mf = new MathfieldElement();
      mf.value = item.latex;
      mf.smartFence = true;
      mf.mathVirtualKeyboardPolicy = "manual";
      mf.menuItems = [];
      mf.placeholder = "\\text{escribí acá…}";
      content.appendChild(mf);
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

    vp.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      const target = e.target as HTMLElement;
      const itemEl = target.closest<HTMLElement>(".item");
      if (itemEl && e.button === 0) {
        const id = itemEl.dataset.id!;
        const item = this.get(id)!;
        const onHandle = !!target.closest(".handle");
        if (target.closest("math-field, textarea")) return;
        if (e.shiftKey) {
          e.preventDefault();
          const sel = this.board.selection.includes(id) ? this.board.selection.filter((s) => s !== id) : [...this.board.selection, id];
          this.commitEdit();
          return this.select(sel);
        }
        if (onHandle || item.kind === "plot") {
          e.preventDefault();
          if (!this.board.selection.includes(id)) this.select([id]);
          const ids = this.board.selection;
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
      if (drag) {
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
