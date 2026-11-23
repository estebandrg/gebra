// "Señalar" on the board: drag a rectangle over what you mean. Do it as many times as you like (each drag adds a
// numbered zone), undo the last zone, cancel them all, or press Listo to keep them and ask. The zones travel with
// the next question so the agent knows exactly what you pointed at. Dragging *inside one equation* marks fragments of
// it instead (the atoms under the drag light up): the agent then gets the complete equation and the marked parts.
import { buildFragmentModel, describeFragment, markParts, selectParts, type FragmentModel } from "../shared/fragments";
import { wrapMath } from "../shared/latex";
import { describeZone, inZone, type Scene, type SceneElement } from "../shared/zone";
import type { BoardView } from "./board";
import type { Chat, PointedZone } from "./chat";
import type { Player } from "./player";
import { el, renderMath } from "./render";

type Rect = { x: number; y: number; w: number; h: number };

/** An equation line being marked: it is re-rendered with every atom wrapped so atoms can be hit-tested. */
interface Frag {
  host: { id: string; source: "pizarra" | "presentación"; content: HTMLElement; latex: string; restore: () => void };
  model: FragmentModel;
  glyphs: { idx: number; el: HTMLElement; r: DOMRect }[];
  box: DOMRect;
  selected: Set<number>;
}

export class PointTool {
  active = false;
  /** `id`: the board item under the press, read before any re-render detaches the target. */
  private drag: { x0: number; y0: number; target: HTMLElement; id?: string } | null = null;
  private frag: Frag | null = null;
  private readonly bar = document.getElementById("point-bar")!;
  private readonly rubber: HTMLElement;

  constructor(
    private readonly board: BoardView,
    private readonly chat: Chat,
    private readonly player: Player,
  ) {
    const vp = board.viewport;
    this.rubber = el("div", "point-rubber", vp);
    this.rubber.hidden = true;
    vp.addEventListener("pointerdown", (e) => this.down(e), { capture: true });
    vp.addEventListener("pointermove", (e) => this.move(e));
    vp.addEventListener("pointerup", (e) => this.up(e));
    vp.addEventListener("pointercancel", () => this.endDrag());
    // a double click while pointing must not create an equation
    vp.addEventListener("dblclick", (e) => this.active && e.stopImmediatePropagation(), { capture: true });
    this.bar.querySelector("[data-undo]")!.addEventListener("click", () => this.chat.undoPointed());
    this.bar.querySelector("[data-clear]")!.addEventListener("click", () => this.cancel());
    this.bar.querySelector("[data-done]")!.addEventListener("click", () => this.toggle(false));
    chat.onPointedChange((list) => this.marks(list));
  }

  toggle(on = !this.active) {
    if (on === this.active) return;
    this.active = on;
    this.bar.hidden = !on;
    document.body.classList.toggle("pointing", on);
    document.getElementById("point-btn")?.classList.toggle("on", on);
    this.endDrag();
    if (on) {
      this.player.pause();
      this.board.commitEdit();
      this.board.select([]);
      const a = document.activeElement as HTMLElement | null;
      if (a?.closest("math-field, textarea, input, select, [contenteditable=true]")) a.blur();
    }
  }

  /** Cancel: drop every zone and leave the mode. */
  cancel() {
    this.chat.clearPointed(true);
    this.toggle(false);
  }

  private down(e: PointerEvent) {
    if (!this.active || e.button !== 0) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.board.viewport.setPointerCapture(e.pointerId);
    this.drag = { x0: e.clientX, y0: e.clientY, target: e.target as HTMLElement, id: (e.target as HTMLElement).closest<HTMLElement>(".item")?.dataset.id };
    this.beginFragment(e);
    // the selection rectangle is always drawn, also while marking fragments of an equation
    this.paint(e);
    this.rubber.hidden = false;
  }

  private move(e: PointerEvent) {
    if (this.frag) this.moveFragment(e);
    if (this.drag) this.paint(e);
  }

  /** Pressing on an equation line: render it with hit-testable atoms (if it parses). */
  private beginFragment(e: PointerEvent) {
    const p = this.board.toWorld(e.clientX, e.clientY);
    const pad = 4;
    const hit = this.scene()
      .elements.filter((x) => x.kind === "math" && x.latex?.trim() && p.x >= x.rect.x - pad && p.x <= x.rect.x + x.rect.w + pad && p.y >= x.rect.y - pad && p.y <= x.rect.y + x.rect.h + pad)
      .sort((a, b) => a.rect.w * a.rect.h - b.rect.w * b.rect.h)[0];
    if (!hit) return;
    let host: Frag["host"] | null = null;
    if (hit.source === "pizarra") {
      const item = this.board.get(hit.id);
      const content = this.board.contentOf(hit.id);
      if (item?.kind === "math" && content) host = { id: hit.id, source: "pizarra", content, latex: item.latex, restore: () => this.board.refreshItem(hit.id) };
    } else {
      const h = this.player.mathHost(hit.id);
      if (h) host = { id: hit.id, source: "presentación", ...h };
    }
    const model = host && buildFragmentModel(host.latex);
    if (!host || !model) return;
    renderMath(host.content, model.wrapped);
    if (host.content.querySelector(".katex-error")) return host.restore();
    const glyphs = [...host.content.querySelectorAll<HTMLElement>("[data-f]")].map((n) => ({
      idx: Number(n.dataset.f),
      el: n,
      r: ((n.firstElementChild as HTMLElement | null) ?? n).getBoundingClientRect(),
    }));
    this.frag = { host, model, glyphs, box: host.content.getBoundingClientRect(), selected: new Set() };
  }

  /** Lights up the atoms under the drag. Returns false once the pointer leaves the equation (it becomes a normal zone). */
  private moveFragment(e: PointerEvent): boolean {
    const f = this.frag!;
    const d = this.drag!;
    const m = 12;
    if (e.clientX < f.box.left - m || e.clientX > f.box.right + m || e.clientY < f.box.top - m || e.clientY > f.box.bottom + m) {
      this.dropFragment();
      return false;
    }
    const x0 = Math.min(d.x0, e.clientX) - 6;
    const x1 = Math.max(d.x0, e.clientX) + 6;
    const y0 = Math.min(d.y0, e.clientY) - 14;
    const y1 = Math.max(d.y0, e.clientY) + 14;
    f.selected = new Set(f.glyphs.filter(({ r }) => (r.left + r.right) / 2 >= x0 && (r.left + r.right) / 2 <= x1 && (r.top + r.bottom) / 2 >= y0 && (r.top + r.bottom) / 2 <= y1).map((g) => g.idx));
    f.glyphs.forEach((g) => g.el.classList.toggle("frag-on", f.selected.has(g.idx)));
    return true;
  }

  private dropFragment() {
    const f = this.frag;
    this.frag = null;
    f?.host.restore();
  }

  /** The marked atoms become one zone: complete equation, marked parts and where they sit. */
  private commitFragment(f: Frag) {
    const parts = selectParts(f.model, f.selected);
    if (!parts.length) return;
    const rs = f.glyphs.filter((g) => f.selected.has(g.idx)).map((g) => g.r);
    const a = this.board.toWorld(Math.min(...rs.map((r) => r.left)), Math.min(...rs.map((r) => r.top)));
    const b = this.board.toWorld(Math.max(...rs.map((r) => r.right)), Math.max(...rs.map((r) => r.bottom)));
    const rect = { x: a.x - 4, y: a.y - 4, w: b.x - a.x + 8, h: b.y - a.y + 8 };
    const equation = f.model.latex;
    const scene = this.scene();
    const line = scene.elements.find((x) => x.id === f.host.id && x.source === f.host.source && x.kind === "math");
    this.chat.addPointed({
      text: `${parts.map((p) => wrapMath(p.latex)).join(" y ")} en ${wrapMath(equation)}`,
      ids: f.host.source === "pizarra" ? [f.host.id] : [],
      detail: line ? describeFragment({ ...line, latex: equation }, parts, scene) : undefined,
      equation,
      parts: parts.map((p) => p.latex),
      marked: markParts(equation, parts),
      rect,
    });
  }

  private paint(e: PointerEvent) {
    const d = this.drag!;
    const vp = this.board.viewport.getBoundingClientRect();
    Object.assign(this.rubber.style, {
      left: `${Math.min(d.x0, e.clientX) - vp.left}px`,
      top: `${Math.min(d.y0, e.clientY) - vp.top}px`,
      width: `${Math.abs(e.clientX - d.x0)}px`,
      height: `${Math.abs(e.clientY - d.y0)}px`,
    });
  }

  private endDrag() {
    this.drag = null;
    this.rubber.hidden = true;
    this.dropFragment();
  }

  private up(e: PointerEvent) {
    const d = this.drag;
    if (!d) return;
    this.board.viewport.releasePointerCapture?.(e.pointerId);
    const fr = this.frag;
    this.endDrag();
    const dragged = Math.hypot(e.clientX - d.x0, e.clientY - d.y0) >= 5;
    if (fr && dragged && fr.selected.size) return this.commitFragment(fr);
    if (!dragged) {
      // A plain click points at the item under the pointer; the assistant's presentation items are not
      // clickable DOM, so they are found by geometry (the smallest one containing the point).
      const id = d.id;
      const node = id ? this.board.elementFor(id) : undefined;
      if (id && node) return this.add(this.board.worldRect(node));
      const p = this.board.toWorld(e.clientX, e.clientY);
      const hit = this.scene()
        .elements.filter((x) => x.source === "presentación" && p.x >= x.rect.x && p.x <= x.rect.x + x.rect.w && p.y >= x.rect.y && p.y <= x.rect.y + x.rect.h)
        .sort((a, b) => a.rect.w * a.rect.h - b.rect.w * b.rect.h)[0];
      if (hit) this.add(hit.rect);
      return;
    }
    const a = this.board.toWorld(d.x0, d.y0);
    const b = this.board.toWorld(e.clientX, e.clientY);
    const region = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
    this.add(region);
  }

  /** Board items plus whatever the assistant's presentation currently shows, as facts. */
  private scene(): Scene {
    const snap = this.player.snapshot();
    return { elements: [...this.board.scene(), ...(snap?.elements ?? [])], notes: snap?.notes ?? [], presentation: snap?.presentation };
  }

  /** Adds a zone: `text` is the short version the learner sees, `detail` the computed report the agent reads. */
  private add(rect: Rect) {
    const scene = this.scene();
    const zone = describeZone(rect, scene);
    const inside = scene.elements
      .filter((e) => inZone(rect, e.rect))
      .sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
    const text = inside.map((e) => this.describe(e)).filter(Boolean).join("  ·  ");
    this.chat.addPointed({
      text: text || `zona vacía de la pizarra (x=${Math.round(rect.x)}, y=${Math.round(rect.y)}, ${Math.round(rect.w)}×${Math.round(rect.h)})`,
      ids: zone.ids,
      detail: zone.detail,
      rect,
    });
  }

  private describe(e: SceneElement): string {
    switch (e.kind) {
      case "math":
        return e.latex?.trim() ? wrapMath(e.latex) : "";
      case "text":
        return e.text ?? "";
      case "plot":
        return `gráfica ${(e.exprs ?? []).map(wrapMath).join(", ")}`;
      case "draw":
        return "dibujo a mano";
      case "card":
        return e.detail ? `tarjeta de ejercicio: ${e.detail}` : "tarjeta de ejercicio";
      default:
        return e.detail ?? "herramienta";
    }
  }

  /** Numbered boxes on the board, one per zone, drawn in board space so they follow pan and zoom. */
  private marks(list: PointedZone[]) {
    this.board.world.querySelectorAll(":scope > .point-mark").forEach((n) => n.remove());
    list.forEach((p, i) => {
      if (!p.rect) return;
      const m = el("div", "point-mark", this.board.world);
      Object.assign(m.style, { left: `${p.rect.x}px`, top: `${p.rect.y}px`, width: `${p.rect.w}px`, height: `${p.rect.h}px` });
      el("b", "", m).textContent = String(i + 1);
    });
  }
}
