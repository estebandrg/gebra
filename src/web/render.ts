// KaTeX helpers: block math, and rich text where `$...$` segments are math.
import katex from "katex";
import { wrapMath } from "../shared/latex";
import { richTokens } from "./rich";

const OPTS = { throwOnError: false, trust: true, strict: "ignore" as const, output: "html" as const };

export function renderMath(el: HTMLElement, latex: string) {
  if (!latex.trim()) {
    el.textContent = "";
    return;
  }
  katex.render(`\\displaystyle ${latex}`, el, OPTS);
}

/** One formula, inline (or as a display block). */
export function renderTeX(el: HTMLElement, latex: string, display = false) {
  katex.render(latex, el, { ...OPTS, displayMode: display });
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
      span.dataset.latex = tok.value;
      katex.render(tok.value, span, OPTS);
      parent.appendChild(span);
    } else parent.appendChild(document.createTextNode(tok.value));
  }
}

/** Copy text to the clipboard and say so (or say it failed). */
export async function copyText(text: string, ok = "LaTeX copiado entre $…$") {
  try {
    await navigator.clipboard.writeText(text);
    toast(ok);
  } catch {
    toast("No pude copiar");
  }
}

/** Click on a rendered formula (inside `root`) copies its LaTeX. */
export function copyLatexOnClick(root: HTMLElement) {
  root.classList.add("tex-copy");
  root.addEventListener("click", (e) => {
    const latex = (e.target as HTMLElement).closest<HTMLElement>("[data-latex]")?.dataset.latex;
    if (latex) void copyText(wrapMath(latex));
  });
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
