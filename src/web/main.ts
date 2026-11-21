// Entry point: loads the board, connects the event stream and wires toolbar, popovers and shortcuts.
import type { Board, ServerEvent, Topic } from "../shared/types";
import { makeExercise } from "../shared/exercises";
import { BoardView } from "./board";
import { Chat } from "./chat";
import { Player } from "./player";
import { el, toast } from "./render";

const board = new BoardView();
const player = new Player(board);
const chat = new Chat(board, player);

const TOPICS: [Topic, string, string][] = [
  ["lineal", "Ecuaciones lineales", "despejar x, ambos miembros, distributiva"],
  ["cuadratica", "Ecuaciones cuadráticas", "despeje, factorización, resolvente"],
  ["factorizar", "Factorizar polinomios", "factor común, trinomios, Gauss"],
  ["operaciones", "Operaciones con polinomios", "suma, resta, producto"],
  ["division", "División de polinomios", "Ruffini, cociente y resto"],
];

async function boot() {
  const data = (await (await fetch("/api/board")).json()) as Board;
  board.load(data);
  await chat.load();
  connect();
}

function connect() {
  const es = new EventSource("/api/events");
  es.onmessage = (e) => {
    const ev = JSON.parse(e.data) as ServerEvent;
    if (ev.type === "presentation") player.play(ev.presentation);
    if (ev.type === "chat") chat.add(ev.message);
    if (ev.type === "presence") chat.setPresence(ev.agents);
    if (ev.type === "status") chat.setTyping(ev.text || null);
  };
  es.onerror = () => chat.setPresence(0);
}

// ------------------------------------------------------------ toolbar

const pop = document.getElementById("exercise-pop")!;
const topics = document.getElementById("topics")!;
for (const [topic, name, hint] of TOPICS) {
  const b = el("button", "", topics);
  b.innerHTML = `<span>${name}</span><small>${hint}</small>`;
  b.addEventListener("click", () => {
    const level = Number((document.querySelector('input[name="level"]:checked') as HTMLInputElement).value) as 1 | 2 | 3;
    pop.hidden = true;
    board.addExercise(makeExercise(topic, level));
  });
}

function tool(name: string) {
  switch (name) {
    case "math": {
      const p = board.freeSpot();
      return board.addMath(Math.round(p.x), Math.round(p.y));
    }
    case "text": {
      const p = board.freeSpot();
      return board.addText(Math.round(p.x), Math.round(p.y));
    }
    case "plot":
      return board.plotSelection();
    case "exercise":
      pop.hidden = !pop.hidden;
      return;
    case "home":
      board.board.view = { x: 0, y: 0, zoom: 1 };
      board.applyView();
      return board.scheduleSave();
    case "zoom-in":
      return board.zoomAt(1.2);
    case "zoom-out":
      return board.zoomAt(1 / 1.2);
    case "clear":
      return board.clearAll();
    case "help":
      document.getElementById("help")!.hidden = false;
      return;
  }
}

document.querySelector(".tools")!.addEventListener("click", (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>("[data-tool]")?.dataset.tool;
  if (t) tool(t);
});
document.getElementById("chat-toggle")!.addEventListener("click", () => document.body.classList.toggle("chat-hidden"));
document.getElementById("help")!.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).matches(".modal, [data-close]")) document.getElementById("help")!.hidden = true;
});
document.addEventListener("pointerdown", (e) => {
  if (!pop.hidden && !(e.target as HTMLElement).closest("#exercise-pop, [data-tool=exercise]")) pop.hidden = true;
});

// ------------------------------------------------------------ keyboard

document.addEventListener("keydown", (e) => {
  const t = e.target as HTMLElement;
  if (t.closest("math-field, textarea, input, select") || board.isEditing()) return;
  if (player.active) {
    if (e.key === " ") (e.preventDefault(), player.toggle());
    else if (e.key === "ArrowRight") player.next();
    else if (e.key === "ArrowLeft") player.prev();
    else if (e.key === "Escape") player.close();
    return;
  }
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "z") return (e.preventDefault(), board.undo(e.shiftKey));
  if (mod && e.key.toLowerCase() === "y") return (e.preventDefault(), board.undo(true));
  if (mod) return;
  const key = e.key.toLowerCase();
  if (key === "n") (e.preventDefault(), tool("math"));
  else if (key === "t") (e.preventDefault(), tool("text"));
  else if (key === "g") tool("plot");
  else if (key === "e") tool("exercise");
  else if (key === "h") tool("home");
  else if (key === "?") tool("help");
  else if (e.key === "Delete" || e.key === "Backspace") board.remove(board.board.selection);
  else if (e.key === "Escape") {
    pop.hidden = true;
    document.getElementById("help")!.hidden = true;
    board.select([]);
  } else if (e.key === "Enter" && board.board.selection.length === 1) {
    e.preventDefault();
    board.startEdit(board.board.selection[0]!);
  }
});

boot().catch((e) => toast(`Error al iniciar: ${e}`, 8000));
