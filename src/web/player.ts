// Live presentation player: executes the agent's step scripts on top of the board with chalk-like
// animations, captions, camera moves, and pause/next/prev controls.
import type { Action, Chalk, NewItem, Placement, Presentation } from "../shared/types";
import type { Scene, SceneNote } from "../shared/zone";
import type { BoardView } from "./board";
import { buildPlot, type BuiltPlot } from "./plot";
import { el, renderMath, renderRich, toast } from "./render";

const NS = "http://www.w3.org/2000/svg";
type Rect = { x: number; y: number; w: number; h: number };

interface PresEntry {
  node: HTMLElement;
  action: Action;
  latex?: string;
}

const color = (c: Chalk | undefined, fallback: Chalk) => `var(--chalk-${c ?? fallback})`;
const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg>';
const jitter = (n = 1.6) => (Math.random() - 0.5) * 2 * n;

export class Player {
  private pres: Presentation | null = null;
  private step = -1;
  private token = 0;
  private paused = false;
  private speed = 1;
  private skipping = false;
  private animating = false;
  private running = new Set<Animation>();
  private entries = new Map<string, PresEntry>();
  private lastWritten: string | null = null;
  /** Highlights, arrows and strikes drawn so far (what "Señalar" reports back to the agent). */
  private notes: SceneNote[] = [];
  private wake: (() => void) | null = null;
  private waitTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly layer = document.getElementById("pres-layer")!;
  private readonly ink = document.getElementById("ink") as unknown as SVGSVGElement;
  private readonly stage = document.getElementById("stage")!;
  private readonly caption = document.getElementById("caption")!;

  constructor(private board: BoardView) {
    this.ink.innerHTML = `<defs><filter id="chalk" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2"/></filter></defs>`;
    this.stage.addEventListener("click", (e) => {
      const ctl = (e.target as HTMLElement).closest<HTMLElement>("[data-ctl]")?.dataset.ctl;
      if (ctl === "restart") this.goTo(0);
      if (ctl === "prev") this.prev();
      if (ctl === "next") this.next();
      if (ctl === "toggle") this.toggle();
      if (ctl === "keep") this.keep();
      if (ctl === "close") this.close();
    });
    const speed = document.getElementById("ctl-speed") as HTMLSelectElement;
    speed.addEventListener("change", () => (this.speed = Number(speed.value)));
  }

  get active() {
    return !!this.pres;
  }

  // ------------------------------------------------------------ public controls

  play(p: Presentation) {
    this.board.commitEdit();
    this.reset();
    this.pres = p;
    this.paused = false;
    this.board.locked = true;
    this.stage.hidden = false;
    document.getElementById("stage-title")!.textContent = p.title;
    void this.runFrom(0);
  }

  async replay(id: string) {
    const res = await fetch(`/api/presentations/${id}`);
    if (!res.ok) return toast("No encontré esa presentación");
    this.play(await res.json());
  }

  next() {
    if (!this.pres) return;
    if (this.animating) return this.finishStep();
    if (this.step >= this.pres.steps.length - 1) return;
    this.wake?.();
  }

  prev() {
    this.goTo(Math.max(0, this.step - 1));
  }

  /** Stop at the current moment (pointing at something must not let it move on). */
  pause() {
    if (this.pres && !this.paused) this.toggle();
  }

  /** A line the assistant wrote, as something whose rendering can be swapped temporarily (fragment marking). */
  mathHost(id: string): { content: HTMLElement; latex: string; restore: () => void } | null {
    const e = this.entries.get(id);
    if (!e || e.action.type !== "write" || e.node.style.opacity === "0" || e.node.style.visibility === "hidden") return null;
    const content = e.node.querySelector<HTMLElement>(".content");
    if (!content) return null;
    const full = e.latex ?? e.action.latex;
    return { content, latex: full.replace(/\\htmlId\{[^}]*\}\{([^{}]*)\}/g, "$1"), restore: () => renderMath(content, full) };
  }

  /** What the presentation has on the board right now, as plain facts: written lines, notes drawn over them, the step's caption. */
  snapshot(): Scene | null {
    const pres = this.pres;
    if (!pres) return null;
    const hidden = new Set<string>();
    const elements: Scene["elements"] = [];
    for (const [id, { node, action, latex }] of this.entries) {
      if (node.style.opacity === "0") hidden.add(id);
      if (node.style.opacity === "0" || node.style.visibility === "hidden") continue;
      const base = { id, source: "presentación" as const, rect: this.board.worldRect(node) };
      if (action.type === "write") elements.push({ ...base, kind: "math", color: action.color ?? "yellow", latex: (latex ?? action.latex).replace(/\\htmlId\{[^}]*\}\{([^{}]*)\}/g, "$1") });
      else if (action.type === "text") elements.push({ ...base, kind: "text", color: action.color ?? "blue", text: action.text });
      else if (action.type === "plot") elements.push({ ...base, kind: "plot", exprs: action.exprs, detail: `x de ${action.xRange[0]} a ${action.xRange[1]}` });
    }
    const baseId = (t?: string) => t?.split("#")[0] ?? "";
    const notes = this.notes.filter((n) => ![n.target, n.from, n.to].some((t) => hidden.has(baseId(t))));
    const say = pres.steps[Math.max(0, this.step)]?.say ?? "";
    return { elements, notes, presentation: { title: pres.title, step: Math.max(0, this.step) + 1, total: pres.steps.length, caption: say } };
  }

  toggle() {
    if (!this.pres) return;
    this.paused = !this.paused;
    this.updateUI();
    if (this.paused) clearTimeout(this.waitTimer);
    else this.wake?.();
  }

  goTo(target: number) {
    if (!this.pres) return;
    const token = ++this.token;
    this.wake?.();
    this.running.forEach((a) => a.finish());
    void (async () => {
      this.reset(false);
      this.skipping = true;
      for (let i = 0; i < target; i++) await this.runActions(this.pres!.steps[i]!.actions ?? [], token);
      this.skipping = false;
      if (token === this.token) await this.runFrom(target);
    })();
  }

  close() {
    if (!this.pres) return;
    this.token++;
    this.wake?.();
    this.running.forEach((a) => a.finish());
    this.reset();
    this.pres = null;
    this.stage.hidden = true;
    this.board.locked = false;
  }

  /** Copy what the agent wrote into the learner's board, then close. */
  keep() {
    const items: NewItem[] = [];
    for (const { node, action, latex } of this.entries.values()) {
      if (node.style.opacity === "0") continue;
      const x = parseFloat(node.style.left);
      const y = parseFloat(node.style.top);
      if (action.type === "write") items.push({ kind: "math", x, y, latex: (latex ?? action.latex).replace(/\\htmlId\{[^}]*\}\{([^{}]*)\}/g, "$1") });
      if (action.type === "text") items.push({ kind: "text", x, y, text: action.text, color: action.color ?? "yellow" });
      if (action.type === "plot")
        items.push({ kind: "plot", x, y, w: action.w ?? 420, h: action.h ?? 300, exprs: action.exprs, xRange: action.xRange, yRange: action.yRange, marks: action.marks });
    }
    this.close();
    if (items.length) {
      this.board.addItems(items);
      toast(`Copié ${items.length} elemento(s) a tu pizarra`);
    }
  }

  // ------------------------------------------------------------ flow

  private reset(clearPres = true) {
    this.layer.textContent = "";
    this.ink.querySelectorAll(":scope > :not(defs)").forEach((n) => n.remove());
    this.entries.clear();
    this.notes = [];
    this.lastWritten = null;
    this.running.clear();
    this.board.restoreTemp();
    if (clearPres) this.step = -1;
  }

  private async runFrom(start: number) {
    const p = this.pres!;
    const token = this.token;
    for (let i = start; i < p.steps.length; i++) {
      if (token !== this.token) return;
      const step = p.steps[i]!;
      this.step = i;
      renderRich(this.caption, step.say);
      this.caption.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 300 });
      this.updateUI();
      this.animating = true;
      this.skipping = false;
      await this.runActions(step.actions ?? [], token);
      this.animating = false;
      this.skipping = false;
      this.updateUI();
      if (token !== this.token) return;
      if (i === p.steps.length - 1) break;
      const words = step.say.split(/\s+/).length;
      const read = Math.min(7500, Math.max(1800, 1100 + words * 270)) / this.speed;
      await this.wait(token, step.pause ? undefined : read);
    }
  }

  private wait(token: number, ms?: number) {
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(this.waitTimer);
        this.wake = null;
        resolve();
      };
      this.wake = done;
      const arm = () => {
        if (ms !== undefined && !this.paused && token === this.token) this.waitTimer = setTimeout(done, ms);
      };
      arm();
    });
  }

  private finishStep() {
    this.skipping = true;
    this.running.forEach((a) => a.finish());
  }

  private updateUI() {
    const n = this.pres?.steps.length ?? 0;
    const last = this.step >= n - 1 && !this.animating;
    document.getElementById("stage-count")!.textContent = last ? `Paso ${n}/${n} · fin` : `Paso ${this.step + 1}/${n}`;
    const toggle = document.getElementById("ctl-toggle")!;
    const icon = this.paused ? "play" : "pause";
    if (toggle.dataset.icon !== icon) {
      toggle.dataset.icon = icon;
      toggle.innerHTML = this.paused ? ICON_PLAY : ICON_PAUSE;
    }
    (document.getElementById("progress-bar") as HTMLElement).style.width = `${(100 * (this.step + 1)) / Math.max(1, n)}%`;
  }

  private async runActions(actions: Action[], token: number) {
    for (const a of actions) {
      if (token !== this.token) return;
      try {
        await this.exec(a);
      } catch (e) {
        console.warn("acción fallida", a, e);
      }
    }
  }

  // ------------------------------------------------------------ helpers

  private ms(base: number) {
    return this.skipping ? 0 : base / this.speed;
  }

  private anim(node: Element, frames: Keyframe[], base: number, easing = "ease-out"): Promise<void> {
    const a = node.animate(frames, { duration: this.ms(base), fill: "forwards", easing });
    this.running.add(a);
    return a.finished.then(
      () => void this.running.delete(a),
      () => void this.running.delete(a),
    );
  }

  private sleep(base: number) {
    const ms = this.ms(base);
    return ms ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
  }

  private targetNode(target: string): Element | null {
    const [base, part] = target.split("#") as [string, string | undefined];
    const host = this.entries.get(base)?.node ?? this.board.elementFor(base);
    if (!host) return null;
    if (part) return host.querySelector(`[id="${CSS.escape(part)}"]`);
    return host.querySelector(".content") ?? host;
  }

  private rect(target: string): Rect | null {
    const node = this.targetNode(target);
    return node ? this.board.worldRect(node) : null;
  }

  private async show(r: Rect, center = false) {
    await this.board.reveal(r, { ms: this.ms(550), center });
  }

  private place(a: Placement, w: number, h: number): { x: number; y: number } {
    let x: number;
    let y: number;
    const gap = 18;
    const anchorRect = (t?: string) => (t ? this.rect(t) : null);
    if (a.at) ({ x, y } = a.at);
    else if (a.below && anchorRect(a.below)) {
      const r = anchorRect(a.below)!;
      [x, y] = [r.x, r.y + r.h + gap];
    } else if (a.above && anchorRect(a.above)) {
      const r = anchorRect(a.above)!;
      [x, y] = [r.x, r.y - h - gap];
    } else if (a.right && anchorRect(a.right)) {
      const r = anchorRect(a.right)!;
      [x, y] = [r.x + r.w + 60, r.y + r.h / 2 - h / 2];
    } else if (a.left && anchorRect(a.left)) {
      const r = anchorRect(a.left)!;
      [x, y] = [r.x - w - 60, r.y + r.h / 2 - h / 2];
    } else if (this.lastWritten && this.rect(this.lastWritten)) {
      const r = this.rect(this.lastWritten)!;
      [x, y] = [r.x, r.y + r.h + gap];
    } else {
      const focus = this.board.focusIds().map((id) => this.board.elementFor(id)).filter(Boolean) as HTMLElement[];
      const lowest = focus.map((n) => this.board.worldRect(n)).sort((p, q) => q.y + q.h - (p.y + p.h))[0];
      if (lowest) [x, y] = [lowest.x, lowest.y + lowest.h + 40];
      else ({ x, y } = this.board.viewCenter());
    }
    x += a.dx ?? 0;
    y += a.dy ?? 0;
    if (a.at) return { x, y };
    const mine = [...this.entries.values()].filter((e) => e.node.style.opacity !== "0").map((e) => this.board.worldRect(e.node));
    return this.board.findFree(x, y, w, h, mine, a.right || a.left ? "right" : "down");
  }

  private path(d: string, stroke: string, width = 3, fill = "none") {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    p.style.stroke = stroke;
    p.style.strokeWidth = String(width);
    p.style.fill = fill;
    this.ink.appendChild(p);
    return p;
  }

  private async draw(p: SVGPathElement, base: number) {
    const len = p.getTotalLength() || 1;
    p.style.strokeDasharray = `${len}`;
    p.style.strokeDashoffset = `${len}`;
    await this.anim(p, [{ strokeDashoffset: len }, { strokeDashoffset: 0 }], base, "ease-in-out");
  }

  private label(text: string, x: number, y: number, c: string, side = false) {
    const lab = el("div", `pres-label${side ? " side" : ""}`, this.layer);
    lab.style.left = `${x}px`;
    lab.style.top = `${y}px`;
    lab.style.color = c;
    renderRich(lab, text);
    return this.anim(lab, [{ opacity: 0 }, { opacity: 1 }], 350);
  }

  /** Reveal a node left-to-right like chalk, with a glowing cursor. */
  private async chalkReveal(node: HTMLElement, x: number, y: number, w: number, h: number) {
    const dur = Math.min(2600, Math.max(450, w * 7));
    if (this.skipping) {
      node.style.visibility = "visible";
      return;
    }
    const cursor = el("div", "chalk-cursor", this.layer);
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y + h * 0.62}px`;
    node.style.visibility = "visible";
    const reveal = this.anim(node, [{ clipPath: "inset(-10% 100% -10% 0)" }, { clipPath: "inset(-10% 0% -10% 0)" }], dur, "linear");
    const move = this.anim(
      cursor,
      [
        { transform: "translate(0, 0)", opacity: 1 },
        { transform: `translate(${w * 0.33}px, -${h * 0.22}px)`, opacity: 1, offset: 0.33 },
        { transform: `translate(${w * 0.66}px, ${h * 0.12}px)`, opacity: 1, offset: 0.66 },
        { transform: `translate(${w}px, 0)`, opacity: 0.2 },
      ],
      dur,
      "linear",
    );
    await Promise.all([reveal, move]);
    cursor.remove();
  }

  // ------------------------------------------------------------ actions

  private async exec(a: Action) {
    switch (a.type) {
      case "write":
      case "text": {
        const node = el("div", `pres-item ${a.type === "write" ? "math" : "note"} c-${a.color ?? (a.type === "write" ? "yellow" : "blue")}`, this.layer);
        node.style.visibility = "hidden";
        if (a.size) node.style.fontSize = `${a.size}px`;
        const content = el("div", "content", node);
        if (a.type === "write") renderMath(content, a.latex);
        else renderRich(content, a.text);
        const w = node.offsetWidth;
        const h = node.offsetHeight;
        const { x, y } = this.place(a, w, h);
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
        this.entries.set(a.id, { node, action: a, latex: a.type === "write" ? a.latex : undefined });
        this.lastWritten = a.id;
        await this.show({ x, y, w, h });
        await this.chalkReveal(node, x, y, w, h);
        return;
      }

      case "mark": {
        const [base] = a.target.split("#") as [string];
        const entry = this.entries.get(base);
        if (entry) {
          renderMath(entry.node.querySelector<HTMLElement>(".content")!, a.latex);
          entry.latex = a.latex;
        } else this.board.renderTemp(base, a.latex);
        return;
      }

      case "highlight": {
        const r0 = this.rect(a.target);
        if (!r0) return;
        await this.show(r0);
        const pad = 7;
        const r = { x: r0.x - pad, y: r0.y - pad, w: r0.w + pad * 2, h: r0.h + pad * 2 };
        const c = color(a.color, "yellow");
        const style = a.style ?? "box";
        this.notes.push({ type: "highlight", target: a.target, style, color: a.color ?? "yellow", label: a.label });
        if (style === "fill") {
          const p = this.path(`M${r.x},${r.y}h${r.w}v${r.h}h${-r.w}Z`, "none", 0, c);
          p.style.opacity = "0";
          p.style.filter = "none";
          await this.anim(p, [{ opacity: 0 }, { opacity: 0.22 }], 450);
        } else if (style === "circle") {
          const cx = r.x + r.w / 2;
          const cy = r.y + r.h / 2;
          const rx = r.w / 2 + 8;
          const ry = r.h / 2 + 6;
          let d = "";
          for (let i = 0; i <= 40; i++) {
            const t = -1.9 + (i / 40) * (Math.PI * 2 + 0.5);
            const k = 1 + i * 0.002;
            d += `${i ? "L" : "M"}${(cx + Math.cos(t) * rx * k + jitter(0.8)).toFixed(1)},${(cy + Math.sin(t) * ry * k + jitter(0.8)).toFixed(1)}`;
          }
          await this.draw(this.path(d, c), 700);
        } else if (style === "underline") {
          const y = r.y + r.h - 2;
          let d = `M${r.x},${y}`;
          for (let x = r.x; x <= r.x + r.w; x += 14) d += `Q${x + 7},${y + 5 + jitter(1)} ${x + 14},${y + jitter(0.6)}`;
          await this.draw(this.path(d, c), 500);
        } else {
          const pts = [
            [r.x, r.y],
            [r.x + r.w, r.y],
            [r.x + r.w, r.y + r.h],
            [r.x, r.y + r.h],
            [r.x + 4, r.y - 2],
          ];
          const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${(x! + jitter()).toFixed(1)},${(y! + jitter()).toFixed(1)}`).join("");
          await this.draw(this.path(d, c), 650);
        }
        if (a.label) await this.label(a.label, r.x + r.w + 12, r.y + r.h / 2, c, true);
        return;
      }

      case "arrow": {
        const A = this.rect(a.from);
        const B = this.rect(a.to);
        if (!A || !B) return;
        await this.show({ x: Math.min(A.x, B.x), y: Math.min(A.y, B.y), w: Math.max(A.x + A.w, B.x + B.w) - Math.min(A.x, B.x), h: Math.max(A.y + A.h, B.y + B.h) - Math.min(A.y, B.y) });
        const ca = { x: A.x + A.w / 2, y: A.y + A.h / 2 };
        const cb = { x: B.x + B.w / 2, y: B.y + B.h / 2 };
        const vertical = Math.abs(cb.y - ca.y) > Math.abs(cb.x - ca.x) * 0.5;
        const s = vertical
          ? { x: A.x + A.w + 14, y: ca.y }
          : { x: cb.x > ca.x ? A.x + A.w + 6 : A.x - 6, y: ca.y };
        const e = vertical ? { x: B.x + B.w + 14, y: cb.y } : { x: cb.x > ca.x ? B.x - 8 : B.x + B.w + 8, y: cb.y };
        const dist = Math.hypot(e.x - s.x, e.y - s.y);
        const bend = a.bend ?? 0.35;
        const nx = vertical ? 1 : -(e.y - s.y) / (dist || 1);
        const ny = vertical ? 0 : (e.x - s.x) / (dist || 1);
        const cpt = { x: (s.x + e.x) / 2 + nx * dist * bend, y: (s.y + e.y) / 2 + ny * dist * bend };
        const c = color(a.color, "white");
        this.notes.push({ type: "arrow", from: a.from, to: a.to, color: a.color ?? "white", label: a.label });
        await this.draw(this.path(`M${s.x},${s.y}Q${cpt.x},${cpt.y} ${e.x},${e.y}`, c, 2.6), 650);
        const ang = Math.atan2(e.y - cpt.y, e.x - cpt.x);
        const head = (k: number) => `L${e.x - 14 * Math.cos(ang + k)},${e.y - 14 * Math.sin(ang + k)}`;
        await this.draw(this.path(`M${e.x - 14 * Math.cos(ang + 0.45)},${e.y - 14 * Math.sin(ang + 0.45)}L${e.x},${e.y}${head(-0.45)}`, c, 2.6), 200);
        if (a.label) {
          const mx = 0.25 * s.x + 0.5 * cpt.x + 0.25 * e.x;
          const my = 0.25 * s.y + 0.5 * cpt.y + 0.25 * e.y;
          await this.label(a.label, vertical ? mx + 50 : mx, vertical ? my + 14 : my - 6, color(a.color, "yellow"));
        }
        return;
      }

      case "strike": {
        const r = this.rect(a.target);
        if (!r) return;
        await this.show(r);
        const c = color(a.color, "red");
        this.notes.push({ type: "strike", target: a.target, color: a.color ?? "red" });
        await this.draw(this.path(`M${r.x - 3},${r.y + r.h * 0.78}L${r.x + r.w + 3},${r.y + r.h * 0.22}`, c, 3), 320);
        return;
      }

      case "plot": {
        const w = a.w ?? 420;
        const h = a.h ?? 300;
        const node = el("div", "pres-item plot", this.layer);
        const built: BuiltPlot = buildPlot({ exprs: a.exprs, xRange: a.xRange, yRange: a.yRange, marks: a.marks, w, h });
        node.appendChild(built.svg);
        const { x, y } = this.place(a, w + 20, h + 8);
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
        this.entries.set(a.id, { node, action: a });
        this.lastWritten = a.id;
        await this.show({ x, y, w, h });
        const hidden = [built.frame, ...built.legend, ...built.marks];
        hidden.forEach((n) => (n.style.opacity = "0"));
        await this.anim(built.frame, [{ opacity: 0 }, { opacity: 1 }], 400);
        for (let i = 0; i < built.curves.length; i++) {
          const leg = built.legend[i];
          if (leg) void this.anim(leg, [{ opacity: 0 }, { opacity: 1 }], 400);
          await this.draw(built.curves[i]!, 1300);
        }
        for (const m of built.marks) {
          await this.anim(m, [{ opacity: 0 }, { opacity: 1 }], 280);
          await this.sleep(120);
        }
        return;
      }

      case "erase": {
        const entry = this.entries.get(a.target);
        if (entry) {
          await this.anim(entry.node, [{ opacity: 1 }, { opacity: 0 }], 400);
          entry.node.style.opacity = "0";
        } else this.board.elementFor(a.target)?.classList.add("dimmed");
        return;
      }

      case "focus": {
        const r = a.target ? this.rect(a.target) : null;
        if (r) await this.board.reveal(r, { center: true, zoom: a.zoom, ms: this.ms(700) });
        else if (a.zoom) await this.board.reveal({ ...this.board.viewCenter(), w: 0, h: 0 }, { center: true, zoom: a.zoom, ms: this.ms(700) });
        return;
      }

      case "wait":
        await this.sleep(a.ms);
        return;

      case "clear":
        this.layer.textContent = "";
        this.ink.querySelectorAll(":scope > :not(defs)").forEach((n) => n.remove());
        this.entries.clear();
        this.notes = [];
        this.lastWritten = null;
        this.board.restoreTemp();
        return;
    }
  }
}
