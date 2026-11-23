// Chat with the agent (the "Asistente"): modes, quick prompts tied to the selection, presence and typing state.
import type { AskMode, ChatMessage } from "../shared/types";
import type { BoardView } from "./board";
import type { Player } from "./player";
import { el, renderMath, renderRich, toast } from "./render";

const MODE_LABEL: Record<AskMode, string> = {
  explain: "Explicame",
  tutor: "Pista",
  check: "¿Está bien?",
  exercise: "Ejercicio",
  chat: "Charla",
  why: "¿Por qué?",
};

export class Chat {
  private mode: AskMode = "explain";
  private agents = 0;
  private readonly list = document.getElementById("messages")!;
  private readonly input = document.getElementById("ask-input") as HTMLTextAreaElement;
  private readonly attachmentsEl = document.getElementById("attachments")!;
  /** Images pasted into the composer: uploaded file name (once the upload finishes) and its preview node. */
  private attachments: { name?: string; node: HTMLElement }[] = [];

  constructor(
    private board: BoardView,
    private player: Player,
  ) {
    document.getElementById("modes")!.addEventListener("click", (e) => {
      const m = (e.target as HTMLElement).closest<HTMLElement>("[data-mode]")?.dataset.mode as AskMode | undefined;
      if (m) this.setMode(m);
    });
    document.getElementById("composer")!.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.send(this.input.value);
    });
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void this.send(this.input.value);
      }
      e.stopPropagation();
    });
    this.list.addEventListener("click", (e) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>("[data-replay]")?.dataset.replay;
      if (id) void this.player.replay(id);
    });
    this.wireImages();
    this.wireResize();
    board.onChange(() => this.refreshContext());
    this.wireNewConversation();
  }

  /** Paste (Ctrl+V) or drop images on the composer: each is uploaded and shown as a removable thumbnail. */
  private wireImages() {
    const composer = document.getElementById("composer")!;
    const imagesOf = (data: DataTransfer | null) => [...(data?.files ?? [])].filter((f) => f.type.startsWith("image/"));
    this.input.addEventListener("paste", (e) => {
      const files = imagesOf(e.clipboardData);
      if (!files.length) return;
      e.preventDefault();
      files.forEach((f) => void this.attach(f));
    });
    const picker = document.getElementById("attach-input") as HTMLInputElement;
    document.getElementById("attach-btn")!.addEventListener("click", () => picker.click());
    picker.addEventListener("change", () => {
      imagesOf({ files: picker.files } as DataTransfer).forEach((f) => void this.attach(f));
      picker.value = "";
    });
    composer.addEventListener("dragover", (e) => {
      if (!imagesOf(e.dataTransfer).length && ![...(e.dataTransfer?.items ?? [])].some((i) => i.type.startsWith("image/"))) return;
      e.preventDefault();
      composer.classList.add("drop");
    });
    composer.addEventListener("dragleave", () => composer.classList.remove("drop"));
    composer.addEventListener("drop", (e) => {
      composer.classList.remove("drop");
      const files = imagesOf(e.dataTransfer);
      if (!files.length) return;
      e.preventDefault();
      files.forEach((f) => void this.attach(f));
    });
  }

  /** Drag the left edge of the sidebar to change its width (kept between visits; double click resets it). */
  private wireResize() {
    const KEY = "gebra.chatWidth";
    const DEFAULT = 380;
    const root = document.documentElement;
    const clamp = (w: number) => Math.round(Math.min(Math.max(300, w), Math.min(760, window.innerWidth * 0.65)));
    const apply = (w: number) => root.style.setProperty("--chat-w", `${clamp(w)}px`);
    const saved = Number(localStorage.getItem(KEY));
    if (saved) apply(saved);
    window.addEventListener("resize", () => apply(parseFloat(getComputedStyle(root).getPropertyValue("--chat-w")) || DEFAULT));
    const handle = document.getElementById("chat-resizer")!;
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      document.body.classList.add("resizing-chat");
    });
    handle.addEventListener("pointermove", (e) => {
      if (handle.hasPointerCapture(e.pointerId)) apply(window.innerWidth - e.clientX);
    });
    const end = (e: PointerEvent) => {
      if (!handle.hasPointerCapture(e.pointerId)) return;
      handle.releasePointerCapture(e.pointerId);
      document.body.classList.remove("resizing-chat");
      localStorage.setItem(KEY, String(parseFloat(getComputedStyle(root).getPropertyValue("--chat-w")) || DEFAULT));
    };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
    handle.addEventListener("dblclick", () => {
      apply(DEFAULT);
      localStorage.removeItem(KEY);
    });
  }

  private async attach(file: File) {
    const node = el("div", "thumb loading", this.attachmentsEl);
    const img = el("img", "", node);
    img.src = URL.createObjectURL(file);
    img.alt = "Imagen adjunta";
    const att: { name?: string; node: HTMLElement } = { node };
    this.attachments.push(att);
    const remove = el("button", "", node);
    remove.type = "button";
    remove.textContent = "✕";
    remove.title = "Quitar imagen";
    remove.addEventListener("click", () => {
      this.attachments = this.attachments.filter((a) => a !== att);
      URL.revokeObjectURL(img.src);
      node.remove();
    });
    const res = await fetch("/api/upload", { method: "POST", headers: { "content-type": file.type }, body: file }).catch(() => null);
    const body = res?.ok ? ((await res.json()) as { name: string }) : null;
    if (!body) {
      toast("No pude subir la imagen (¿servidor apagado o más de 10 MB?)");
      remove.click();
      return;
    }
    att.name = body.name;
    node.classList.remove("loading");
  }

  /** "Nueva": two clicks (the first asks to confirm) delete the conversation on the server and start an empty one. */
  private wireNewConversation() {
    const btn = document.getElementById("chat-new") as HTMLButtonElement;
    const label = btn.querySelector("span")!;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reset = () => {
      clearTimeout(timer);
      btn.classList.remove("confirm");
      label.textContent = "Nueva";
    };
    btn.addEventListener("click", async () => {
      if (!btn.classList.contains("confirm")) {
        btn.classList.add("confirm");
        label.textContent = "¿Borrar todo?";
        timer = setTimeout(reset, 4000);
        return;
      }
      reset();
      const res = await fetch("/api/chat", { method: "DELETE" }).catch(() => null);
      if (!res?.ok) return toast("No pude borrar la conversación (¿servidor apagado?)");
      toast("Conversación nueva");
    });
  }

  /** Empty conversation (after a delete): clears the list, the typing state and any running presentation. */
  reset() {
    this.player.close();
    this.setTyping(null);
    void this.load();
  }

  setMode(m: AskMode) {
    this.mode = m;
    document.querySelectorAll<HTMLElement>("#modes [data-mode]").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
  }

  async load() {
    const msgs = (await (await fetch("/api/chat")).json()) as ChatMessage[];
    this.list.textContent = "";
    if (!msgs.length)
      this.system("Escribí algo en la pizarra, seleccionalo y preguntame. Te respondo con una presentación en vivo sobre la pizarra.");
    msgs.forEach((m) => this.add(m, false));
    this.list.scrollTop = this.list.scrollHeight;
  }

  system(text: string) {
    const d = el("div", "msg system", this.list);
    renderRich(d, text);
  }

  add(m: ChatMessage, scroll = true) {
    const d = el("div", `msg ${m.from}${m.presentationId ? " pres" : ""}`, this.list);
    if (m.from === "me" && m.mode) el("span", "mode", d).textContent = MODE_LABEL[m.mode];
    if (m.images?.length) {
      const imgs = el("div", "imgs", d);
      for (const name of m.images) {
        const a = el("a", "", imgs);
        a.href = `/api/uploads/${name}`;
        a.target = "_blank";
        a.rel = "noopener";
        const img = el("img", "", a);
        img.src = a.href;
        img.alt = "Imagen enviada";
        img.loading = "lazy";
      }
    }
    const body = el("div", "", d);
    renderRich(body, m.presentationId ? `🎬 ${m.text}` : m.text);
    if (m.presentationId) {
      const b = el("button", "", d);
      b.textContent = "▶ Ver de nuevo";
      b.dataset.replay = m.presentationId;
    }
    if (m.from === "profe") this.setTyping(null);
    if (scroll) this.list.scrollTop = this.list.scrollHeight;
  }

  setPresence(agents: number, model?: string) {
    this.agents = agents;
    const on = agents > 0;
    const m = document.getElementById("presence-model")!;
    m.textContent = model ?? "";
    m.hidden = !on || !model;
    m.title = model ? `Modelo de IA que responde: ${model}` : "";
    document.getElementById("presence-dot")!.classList.toggle("on", on);
    const t = document.getElementById("presence-text")!;
    t.textContent = on ? "conectado · te está mirando" : "desconectado";
    t.classList.toggle("on", on);
  }

  setTyping(text: string | null) {
    const t = document.getElementById("typing")!;
    t.hidden = !text;
    if (text) document.getElementById("typing-text")!.textContent = text;
  }

  private focusLatex(): string[] {
    return this.board
      .focusIds()
      .map((id) => this.board.get(id))
      .map((i) => (i?.kind === "math" ? i.latex : i?.kind === "text" ? i.text : i?.kind === "plot" ? `gráfica ${i.exprs.join(", ")}` : ""))
      .filter(Boolean);
  }

  private refreshContext() {
    const focus = this.focusLatex();
    const line = document.getElementById("focus-line")!;
    line.textContent = "";
    if (focus.length) {
      line.append("Sobre: ");
      const span = el("span", "", line);
      if (focus.length === 1 && this.board.get(this.board.focusIds()[0]!)?.kind === "math") renderMath(span, focus[0]!);
      else span.textContent = `${focus.length} elemento(s) seleccionado(s)`;
    }
    const chips = document.getElementById("chips")!;
    chips.textContent = "";
    const hasMath = focus.length > 0;
    const options: [string, AskMode][] = hasMath
      ? [
          ["Explicame cómo resolver esto", "explain"],
          ["Dame solo una pista", "tutor"],
          ["Revisá mis pasos", "check"],
          ["Dame un ejercicio parecido", "exercise"],
        ]
      : [
          ["¿Qué es un polinomio?", "explain"],
          ["Enseñame a resolver ecuaciones lineales", "explain"],
          ["Ponéme un ejercicio para practicar", "exercise"],
        ];
    for (const [text, mode] of options) {
      const b = el("button", "", chips);
      b.textContent = text;
      b.addEventListener("click", () => void this.send(text, mode));
    }
  }

  async send(raw: string, mode = this.mode) {
    const text = raw.trim();
    if (this.attachments.some((a) => !a.name)) return toast("Esperá a que termine de subirse la imagen");
    const images = this.attachments.map((a) => a.name!);
    if (!text && !images.length) return;
    this.input.value = "";
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, mode, focus: this.board.focusIds(), images }),
    }).catch(() => null);
    if (!res?.ok) {
      this.input.value = raw;
      return toast("No pude enviar el mensaje (¿servidor apagado?)");
    }
    this.attachments = [];
    this.attachmentsEl.textContent = "";
    await this.board.saveNow();
    const { agents } = (await res.json()) as { agents: number };
    if (agents > 0) this.setTyping("el asistente está mirando la pizarra…");
    else this.system("El asistente no está escuchando ahora. En la terminal decile **«conectate a la pizarra»**; tu pregunta queda guardada.");
  }
}
