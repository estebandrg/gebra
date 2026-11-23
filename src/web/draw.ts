// Pen tool: freehand strokes on the board (one DrawItem per stroke) plus a stroke eraser.
import { strokePath, strokeToItem } from "../shared/draw";
import { CHALKS, type Chalk } from "../shared/types";
import type { BoardView } from "./board";

const SIZES = [2, 4, 8];
const SVG_NS = "http://www.w3.org/2000/svg";

export class DrawTool {
  active = false;
  private color: Chalk = "yellow";
  private size = SIZES[1]!;
  private eraser = false;
  private stroke: { pts: [number, number][]; path: SVGPathElement; erased: Set<string> } | null = null;
  private readonly bar = document.getElementById("draw-bar")!;
  private readonly live = document.getElementById("draw-live") as unknown as SVGSVGElement;

  constructor(private board: BoardView) {
    this.buildBar();
    const vp = board.viewport;
    vp.addEventListener("pointerdown", (e) => this.down(e), { capture: true });
    vp.addEventListener("pointermove", (e) => this.move(e), { capture: true });
    vp.addEventListener("pointerup", () => this.up());
    vp.addEventListener("pointercancel", () => this.up());
    // while drawing, a double click must not create an equation
    vp.addEventListener("dblclick", (e) => this.active && e.stopImmediatePropagation(), { capture: true });
  }

  toggle(on = !this.active) {
    this.active = on;
    this.bar.hidden = !on;
    document.body.classList.toggle("drawing", on);
    document.getElementById("tool-draw")?.classList.toggle("on", on);
    if (on) {
      this.board.commitEdit();
      this.board.select([]);
    } else this.cancel();
  }

  private buildBar() {
    const colors = this.bar.querySelector<HTMLElement>(".draw-colors")!;
    for (const c of CHALKS) {
      const b = document.createElement("button");
      b.className = `swatch c-${c}`;
      b.dataset.color = c;
      b.title = c;
      b.setAttribute("aria-label", `Color ${c}`);
      b.addEventListener("click", () => this.setColor(c));
      colors.appendChild(b);
    }
    this.bar.querySelectorAll<HTMLElement>("[data-size]").forEach((b) => b.addEventListener("click", () => this.setSize(Number(b.dataset.size))));
    this.bar.querySelector("[data-eraser]")!.addEventListener("click", () => this.setEraser(!this.eraser));
    this.bar.querySelector("[data-done]")!.addEventListener("click", () => this.toggle(false));
    this.setColor(this.color);
    this.setSize(this.size);
  }

  private setColor(c: Chalk) {
    this.color = c;
    this.setEraser(false);
    this.bar.querySelectorAll<HTMLElement>("[data-color]").forEach((b) => b.classList.toggle("active", b.dataset.color === c));
  }

  private setSize(s: number) {
    this.size = s;
    this.setEraser(false);
    this.bar.querySelectorAll<HTMLElement>("[data-size]").forEach((b) => b.classList.toggle("active", Number(b.dataset.size) === s));
  }

  private setEraser(on: boolean) {
    this.eraser = on;
    document.body.classList.toggle("erasing", on);
    this.bar.querySelector("[data-eraser]")!.classList.toggle("active", on);
  }

  private down(e: PointerEvent) {
    if (!this.active || e.button !== 0) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.board.commitEdit();
    this.board.viewport.setPointerCapture(e.pointerId);
    const p = this.board.toWorld(e.clientX, e.clientY);
    const path = document.createElementNS(SVG_NS, "path");
    if (!this.eraser) {
      path.setAttribute("class", `c-${this.color}`);
      path.setAttribute("stroke-width", String(this.size));
      this.live.appendChild(path);
    }
    this.stroke = { pts: [[p.x, p.y]], path, erased: new Set() };
    if (this.eraser) this.erase(e);
    else path.setAttribute("d", strokePath(this.stroke.pts));
  }

  private move(e: PointerEvent) {
    const s = this.stroke;
    if (!s) return;
    e.stopImmediatePropagation();
    if (this.eraser) return this.erase(e);
    // coalesced events keep fast strokes smooth
    for (const ev of e.getCoalescedEvents?.() ?? [e]) {
      const p = this.board.toWorld(ev.clientX, ev.clientY);
      const last = s.pts.at(-1)!;
      if (Math.hypot(p.x - last[0], p.y - last[1]) * this.board.board.view.zoom < 1.5) continue;
      s.pts.push([p.x, p.y]);
    }
    s.path.setAttribute("d", strokePath(s.pts));
  }

  /** Marks the stroke under the pointer; the strokes are removed together on release (one undo step). */
  private erase(e: PointerEvent) {
    const id = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(".item.draw")?.dataset.id;
    if (!id || this.stroke!.erased.has(id)) return;
    this.stroke!.erased.add(id);
    this.board.elementFor(id)?.classList.add("dimmed");
  }

  private up() {
    const s = this.stroke;
    if (!s) return;
    this.stroke = null;
    s.path.remove();
    if (this.eraser) return this.board.remove([...s.erased]);
    const item = strokeToItem(s.pts, this.color, this.size);
    if (item) this.board.addDraw(item);
  }

  private cancel() {
    this.stroke?.path.remove();
    this.stroke = null;
    this.setEraser(false);
  }
}
