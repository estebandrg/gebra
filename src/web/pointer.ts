// Point at something by selecting it: select text in the chat, a presentation caption or the theory sheet and a
// floating button attaches it to the next question, so the agent knows exactly what is being pointed at.
import type { Chat } from "./chat";
import { el } from "./render";

/** Places where selecting text makes sense (the board itself is selected item by item, which the agent already sees). */
const ASKABLE = "#messages, #caption, #theory-sheet";
const MAX = 400;

const formulaOf = (n: Node | null) => (n instanceof Element ? n : n?.parentElement)?.closest<HTMLElement>("[data-latex]") ?? null;

/** The selected text as the learner meant it: formulas come back as `$latex$`, never as KaTeX's garbled glyphs. */
export function selectionText(sel: Selection): string {
  if (sel.isCollapsed || !sel.rangeCount) return "";
  const range = sel.getRangeAt(0);
  const a = formulaOf(range.startContainer);
  // A selection inside one formula points at the whole formula.
  if (a && a === formulaOf(range.endContainer)) return `$${a.dataset.latex}$`;
  const frag = range.cloneContents();
  frag.querySelectorAll<HTMLElement>("[data-latex]").forEach((f) => f.replaceWith(document.createTextNode(`$${f.dataset.latex}$`)));
  return (frag.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, MAX);
}

/** Text currently selected inside the places the learner can point at (empty if none). */
export function pointedText(): string {
  const sel = window.getSelection();
  const node = sel?.anchorNode;
  const inside = !!sel?.rangeCount && !!(node instanceof Element ? node : node?.parentElement)?.closest(ASKABLE);
  return sel && inside ? selectionText(sel) : "";
}

export function wireSelectionAsk(chat: Chat) {
  const btn = el("button", "ask-selection", document.body);
  btn.type = "button";
  btn.textContent = "Preguntar sobre esto";
  btn.hidden = true;
  let text = "";

  const refresh = () => {
    const sel = window.getSelection();
    text = pointedText();
    if (!text || !sel) {
      btn.hidden = true;
      return;
    }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    btn.hidden = false;
    const w = btn.offsetWidth;
    btn.style.left = `${Math.round(Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8))}px`;
    btn.style.top = `${Math.round(r.top > 44 ? r.top - 38 : r.bottom + 8)}px`;
  };

  document.addEventListener("selectionchange", () => setTimeout(refresh, 0));
  // Keep the selection alive while the button is pressed.
  btn.addEventListener("pointerdown", (e) => e.preventDefault());
  btn.addEventListener("click", () => {
    if (!text) return;
    chat.addPointed({ text });
    window.getSelection()?.removeAllRanges();
    btn.hidden = true;
  });
}
