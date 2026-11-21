// KaTeX helpers: block math, and rich text where `$...$` segments are math.
import katex from "katex";
import { richTokens } from "./rich";

const OPTS = { throwOnError: false, trust: true, strict: "ignore" as const, output: "html" as const };

export function renderMath(el: HTMLElement, latex: string) {
  if (!latex.trim()) {
    el.textContent = "";
    return;
  }
  katex.render(`\\displaystyle ${latex}`, el, OPTS);
}

export function renderRich(el: HTMLElement, text: string) {
  el.textContent = "";
  let strong: HTMLElement | null = null;
  for (const tok of richTokens(text)) {
    if (!tok.bold) strong = null;
    else if (!strong) strong = el.appendChild(document.createElement("strong"));
    const parent = strong ?? el;
    if (tok.kind === "math") {
      const span = document.createElement("span");
      katex.render(tok.value, span, OPTS);
      parent.appendChild(span);
    } else parent.appendChild(document.createTextNode(tok.value));
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

export function toast(msg: string, ms = 2600) {
  const t = document.getElementById("toast")!;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout((toast as any).timer);
  (toast as any).timer = setTimeout(() => (t.hidden = true), ms);
}
