// KaTeX helpers: block math, and rich text where `$...$` segments are math.
import katex from "katex";

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
  const parts = text.split(/(\$[^$]+\$)/g);
  for (const part of parts) {
    if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
      const span = document.createElement("span");
      katex.render(part.slice(1, -1), span, OPTS);
      el.appendChild(span);
    } else if (part) {
      // **bold** support for short emphasis
      part.split(/(\*\*[^*]+\*\*)/g).forEach((seg) => {
        if (seg.startsWith("**") && seg.endsWith("**") && seg.length > 4) {
          const b = document.createElement("strong");
          b.textContent = seg.slice(2, -2);
          el.appendChild(b);
        } else if (seg) el.appendChild(document.createTextNode(seg));
      });
    }
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
