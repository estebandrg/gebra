// The chat box. It keeps its own text model (so `$…$` can be shown two ways): the formula the caret is in (or
// touching) shows its LaTeX with the rendered formula drawn below, and every other formula is replaced by the
// rendered formula highlighted in yellow. Clicking a rendered formula brings its LaTeX back.
import { mathAt, mathSpans, type MathSpan } from "../shared/latex";
import { deleteRange } from "../shared/textedit";
import { el as h, renderTeX } from "./render";

interface Snap {
  text: string;
  a: number;
  b: number;
}

const rendered = new Map<string, HTMLElement>();
/** A rendered formula node (cached by source: rendering KaTeX on every keystroke would be wasteful). */
function formulaNode(s: MathSpan, text: string): HTMLElement {
  const src = text.slice(s.start, s.end);
  let node = rendered.get(src);
  if (!node) {
    node = h("span", "m-rendered");
    node.contentEditable = "false";
    node.dataset.src = src;
    node.dataset.delim = String(s.delim);
    renderTeX(node, s.latex, false);
    if (rendered.size > 200) rendered.delete(rendered.keys().next().value!);
    rendered.set(src, node);
  }
  const copy = node.cloneNode(true) as HTMLElement;
  copy.dataset.start = String(s.start);
  return copy;
}

const isRaw = (n: Node): n is HTMLElement => n instanceof HTMLElement && n.classList.contains("m-raw");
/** Length of a child in source characters (a rendered formula stands for its whole `$…$` source; the sentinel <br> for nothing). */
const lengthOf = (n: Node) => (n.nodeType === 3 ? (n as Text).data.length : n instanceof HTMLElement && n.dataset.src ? n.dataset.src.length : n.nodeName === "BR" ? 0 : (n.textContent ?? "").length);
const textOf = (n: Node): Text | null => (n.nodeType === 3 ? (n as Text) : isRaw(n) ? (n.firstChild as Text | null) : null);

export class MathEditor {
  private text = "";
  /** Selection in source offsets (a ≤ b). */
  private a = 0;
  private b = 0;
  private composing = false;
  private focused = false;
  private pointerDown = false;
  private sig = "";
  private shown = "";
  private undoStack: Snap[] = [];
  private redoStack: Snap[] = [];
  private lastType = "";
  private lastAt = 0;

  constructor(
    readonly el: HTMLElement,
    private readonly preview: HTMLElement,
  ) {
    el.addEventListener("beforeinput", (e) => this.onBeforeInput(e));
    el.addEventListener("input", () => !this.composing && this.fromDom());
    el.addEventListener("compositionstart", () => (this.composing = true));
    el.addEventListener("compositionend", () => {
      this.composing = false;
      this.fromDom();
    });
    el.addEventListener("focus", () => {
      this.focused = true;
      setTimeout(() => this.refresh(), 0);
    });
    el.addEventListener("blur", () => {
      this.focused = false;
      this.draw();
      this.showPreview();
    });
    el.addEventListener("pointerdown", () => (this.pointerDown = true));
    const up = () => {
      if (!this.pointerDown) return;
      this.pointerDown = false;
      this.refresh();
    };
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    document.addEventListener("selectionchange", () => this.focused && this.refresh());
    el.addEventListener("click", (e) => {
      const f = (e.target as HTMLElement).closest<HTMLElement>(".m-rendered");
      if (!f) return;
      this.focused = true;
      this.a = this.b = Number(f.dataset.start) + Number(f.dataset.delim);
      this.draw();
      this.setSel();
      this.showPreview();
    });
    // The DOM holds rendered glyphs for formulas, so copy/cut take the source text from the model.
    el.addEventListener("copy", (e) => this.clip(e, false));
    el.addEventListener("cut", (e) => this.clip(e, true));
  }

  get value() {
    return this.composing ? this.readDom() : this.text;
  }

  set value(v: string) {
    this.text = v;
    this.a = this.b = v.length;
    this.draw();
    if (this.focused) this.setSel();
    this.showPreview();
  }

  focus() {
    this.el.focus();
    this.focused = true;
    this.a = this.b = this.text.length;
    this.draw();
    this.setSel();
    this.showPreview();
  }

  // ---------------------------------------------------------------- model edits

  private onBeforeInput(e: InputEvent) {
    if (e.isComposing || e.inputType === "insertCompositionText") return;
    e.preventDefault();
    const t = e.inputType;
    if (t === "historyUndo") return this.history(this.undoStack, this.redoStack);
    if (t === "historyRedo") return this.history(this.redoStack, this.undoStack);
    let [a, b] = this.readSel() ?? [this.a, this.b];
    let ins = "";
    if (t === "insertText") ins = e.data ?? "";
    else if (t === "insertFromPaste" || t === "insertFromDrop" || t === "insertReplacementText") ins = e.dataTransfer?.getData("text/plain") ?? e.data ?? "";
    else if (t === "insertLineBreak" || t === "insertParagraph") ins = "\n";
    else if (t.startsWith("delete")) {
      if (a === b) [a, b] = deleteRange(this.text, a, t);
    } else return;
    this.edit(a, b, ins, t);
  }

  private edit(a: number, b: number, ins: string, type: string) {
    if (a === b && !ins) return;
    const now = Date.now();
    // Typing in one go is a single undo step.
    if (!(type === "insertText" && this.lastType === "insertText" && now - this.lastAt < 1000)) this.pushUndo();
    this.lastType = type;
    this.lastAt = now;
    this.text = this.text.slice(0, a) + ins + this.text.slice(b);
    this.a = this.b = a + ins.length;
    this.draw();
    this.setSel();
    this.showPreview();
  }

  private pushUndo() {
    this.undoStack.push({ text: this.text, a: this.a, b: this.b });
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
  }

  private history(from: Snap[], to: Snap[]) {
    const snap = from.pop();
    if (!snap) return;
    to.push({ text: this.text, a: this.a, b: this.b });
    this.text = snap.text;
    this.a = snap.a;
    this.b = snap.b;
    this.lastType = "";
    this.draw();
    this.setSel();
    this.showPreview();
  }

  private clip(e: ClipboardEvent, cut: boolean) {
    const s = this.readSel();
    if (!s || s[0] === s[1]) return;
    e.preventDefault();
    e.clipboardData?.setData("text/plain", this.text.slice(s[0], s[1]));
    if (cut) this.edit(s[0], s[1], "", "deleteByCut");
  }

  /** Text typed through an IME/dead key (composition) lands in the DOM first; take it from there. */
  private fromDom() {
    this.text = this.readDom();
    const s = this.readSel();
    [this.a, this.b] = s ?? [this.text.length, this.text.length];
    this.draw();
    if (this.focused) this.setSel();
    this.showPreview();
  }

  private readDom(): string {
    let out = "";
    for (const k of this.el.childNodes) out += k instanceof HTMLElement && k.dataset.src ? k.dataset.src : k.nodeName === "BR" ? "" : (k.textContent ?? "");
    return out;
  }

  // ---------------------------------------------------------------- drawing

  /** Source offsets of the formulas that show their LaTeX: those the (collapsed) caret is in or touching. */
  private activeStarts(): Set<number> {
    if (!this.focused || this.a !== this.b) return new Set();
    return new Set(mathSpans(this.text).filter((s) => s.start <= this.b && this.a <= s.end).map((s) => s.start));
  }

  private draw() {
    const active = this.activeStarts();
    this.sig = [...active].join(",");
    const frag = document.createDocumentFragment();
    let at = 0;
    const plain = (to: number) => to > at && frag.append(document.createTextNode(this.text.slice(at, to)));
    for (const s of mathSpans(this.text)) {
      const ok = s.closed && s.latex.trim();
      if (ok && !active.has(s.start)) {
        plain(s.start);
        frag.append(formulaNode(s, this.text));
        at = s.end;
      } else if (ok || !s.closed) {
        // LaTeX being edited (or a formula still being typed): monospace so it reads as code.
        plain(s.start);
        const raw = h("span", "m-raw");
        raw.textContent = this.text.slice(s.start, s.end);
        frag.append(raw);
        at = s.end;
      }
    }
    plain(this.text.length);
    // A trailing newline needs a sentinel to show the empty last line.
    if (this.text.endsWith("\n")) frag.append(document.createElement("br"));
    this.el.replaceChildren(frag);
  }

  /** Re-read the selection; redraw only when the set of formulas showing LaTeX changed. */
  private refresh() {
    if (this.composing || this.pointerDown) return;
    const s = this.readSel();
    if (s) [this.a, this.b] = s;
    if (this.a === this.b && [...this.activeStarts()].join(",") !== this.sig) {
      this.draw();
      this.setSel();
    }
    this.showPreview();
  }

  private showPreview() {
    const span = this.focused && this.a === this.b ? mathAt(this.text, this.b) : null;
    if (!span) {
      this.preview.hidden = true;
      this.shown = "";
      return;
    }
    this.preview.hidden = false;
    if (span.latex !== this.shown) {
      this.shown = span.latex;
      renderTeX(this.preview, span.latex, true);
    }
  }

  // ---------------------------------------------------------------- DOM <-> source offsets

  private offsetOf(node: Node, off: number): number {
    const kids = [...this.el.childNodes];
    let pos = 0;
    if (node === this.el) {
      for (let i = 0; i < Math.min(off, kids.length); i++) pos += lengthOf(kids[i]!);
      return pos;
    }
    for (const k of kids) {
      if (k === node) return pos + (off > 0 && k.nodeType !== 3 ? lengthOf(k) : k.nodeType === 3 ? off : 0);
      if (k.contains(node)) return pos + (textOf(k) === node ? off : 0);
      pos += lengthOf(k);
    }
    return pos;
  }

  private posOf(off: number): [Node, number] {
    const kids = [...this.el.childNodes];
    let pos = 0;
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i]!;
      const len = lengthOf(k);
      const t = textOf(k);
      if (t && off <= pos + len) return [t, off - pos];
      if (!t && off === pos) return [this.el, i];
      pos += len;
    }
    return [this.el, kids.length];
  }

  private readSel(): [number, number] | null {
    const s = window.getSelection();
    if (!s?.rangeCount || !s.anchorNode || !s.focusNode || !this.el.contains(s.anchorNode) || !this.el.contains(s.focusNode)) return null;
    const x = this.offsetOf(s.anchorNode, s.anchorOffset);
    const y = this.offsetOf(s.focusNode, s.focusOffset);
    return [Math.min(x, y), Math.max(x, y)];
  }

  private setSel() {
    const s = window.getSelection();
    if (!s) return;
    const r = document.createRange();
    const [n1, o1] = this.posOf(this.a);
    const [n2, o2] = this.posOf(this.b);
    r.setStart(n1, o1);
    r.setEnd(n2, o2);
    s.removeAllRanges();
    s.addRange(r);
  }
}
