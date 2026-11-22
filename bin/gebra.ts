#!/usr/bin/env bun
// gebra: the agent's side of the whiteboard. Reads the board, watches learner questions,
// sends live presentations and chat messages, and exposes the CAS.
import { readFileSync } from "node:fs";
import * as cas from "../src/shared/cas";
import { cardLines, cardProgress } from "../src/shared/cards";
import { checkExerciseStep, exerciseAnswerTeX } from "../src/shared/exercises";
import { TOOL_LABEL, toolSummary } from "../src/shared/tools";
import type { Ask, Board, CardItem, ChatMessage, Item } from "../src/shared/types";

const BASE = process.env.GEBRA_URL ?? "http://localhost:5179";

const HELP = `gebra — conexión del profe con la pizarra (${BASE})

  gebra board [--json]        Muestra la pizarra: ítems, posiciones, cadenas de pasos con verificación CAS y ejercicios
  gebra watch [--model <m>]   Escucha preguntas de la web; imprime una línea por pregunta (para monitor).
                              --model (o GEBRA_MODEL) muestra en la web qué modelo de IA responde
  gebra present <file|->      Envía una presentación en vivo (JSON del DSL; ver AGENTS.md)
  gebra say <texto...>        Manda un mensaje al chat de la web ($...$ = matemática)
  gebra exercise <tema> [nivel]                 Pone un ejercicio generado en la pizarra
        temas: lineal | cuadratica | factorizar | operaciones | division · nivel 1-3
  gebra exercise --latex <ec> [--prompt <txt>] [--kind solve|factor|expand|simplify] [--answer a,b]
                              Pone un ejercicio propio (solve: la respuesta la calcula el CAS)
  gebra status [texto]        Muestra "el profe está…" en la web (sin texto lo borra)
  gebra chat [n]              Últimos n mensajes del chat (por defecto 10)
  gebra cas <op> <args...>    Álgebra simbólica (entrada y salida en LaTeX):
      solve <ec> [var]        check <paso1> <paso2>     factor <expr>     expand <expr>
      simplify <expr>         divide <dividendo> <divisor>                 roots <expr>
      eval <expr> x=1 y=2     tex <expr-nerdamer>

Variables de entorno: GEBRA_URL (por defecto http://localhost:5179)`;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, init);
  } catch {
    fail(`No me pude conectar a ${BASE}. ¿Está corriendo el servidor? (bun start)`);
  }
  const body = (await res.json()) as any;
  if (!res.ok) {
    if (Array.isArray(body?.errors)) fail(`La presentación tiene errores:\n  - ${body.errors.join("\n  - ")}`);
    fail(body?.error ?? `HTTP ${res.status}`);
  }
  return body as T;
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const postJson = (path: string, data: unknown) =>
  api<any>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });

// ---------------------------------------------------------------- board

function describeItem(item: Item): string {
  const pos = `(${Math.round(item.x)},${Math.round(item.y)})`;
  if (item.kind === "math") return `[${item.id}] ${pos} math: ${item.latex}`;
  if (item.kind === "text") return `[${item.id}] ${pos} texto: ${item.text}`;
  if (item.kind === "card") return `[${item.id}] ${pos} tarjeta del ejercicio ${item.exercise}`;
  if (item.kind === "tool") return `[${item.id}] ${pos} herramienta ${TOOL_LABEL[item.tool]}: ${toolSummary(item)}`;
  return `[${item.id}] ${pos} gráfica ${item.w}x${item.h}: ${item.exprs.join(" ; ")}  x∈[${item.xRange.join(", ")}]`;
}

export function renderBoard(board: Board): string {
  const lines: string[] = [];
  const byChain = new Map<string, Item[]>();
  const loose: Item[] = [];
  const cards: CardItem[] = [];
  for (const it of board.items) {
    if (it.kind === "card") cards.push(it);
    else if ((it.kind === "math" || it.kind === "tool") && it.card && board.items.some((c) => c.id === it.card)) continue;
    else if (it.kind === "math" && it.chain) {
      const list = byChain.get(it.chain) ?? [];
      list.push(it);
      byChain.set(it.chain, list);
    } else loose.push(it);
  }
  const sel = new Set(board.selection);
  const mark = (it: Item) => (sel.has(it.id) ? "  ← seleccionado" : "");

  for (const card of cards) {
    const p = cardProgress(board, card, cas.compareSteps);
    const ex = p.exercise;
    lines.push(
      `\nTarjeta ${card.id}${ex ? ` — ejercicio ${ex.id} (${ex.topic} nivel ${ex.level}, ${ex.kind}) · enunciado fijo: "${ex.prompt}": ${ex.latex}` : " — (ejercicio perdido)"}${mark(card)}`,
    );
    const byId = new Map(p.lines.map((l) => [l.id, l]));
    const work = cardLines(board, card.id).filter((l) => l.latex.trim());
    if (!work.length) lines.push("  (sin pasos todavía)");
    work.forEach((it, i) => {
      const c = byId.get(it.id)?.check;
      const check = !c ? "" : c.status === "equivalent" ? "  ✓ equivalente" : c.status === "different" ? `  ✗ ${c.reason}` : `  ? ${c.reason}`;
      lines.push(`  ${i + 1}. [${it.id}] math: ${it.latex}${check}${mark(it)}`);
    });
    for (const t of board.items) if (t.kind === "tool" && t.card === card.id) lines.push(`  · [${t.id}] ${TOOL_LABEL[t.tool]}: ${toolSummary(t)}`);
    if (ex) lines.push(`  estado: ${p.status === "empty" ? "sin pasos" : `${p.status} — ${p.reason}`} · respuesta esperada (no revelar en modo tutor): ${exerciseAnswerTeX(ex)}`);
  }
  for (const [chain, items] of byChain) {
    items.sort((a, b) => a.y - b.y);
    const ex = board.exercises.find((e) => items.some((i) => i.kind === "math" && i.exercise === e.id));
    lines.push(`\nCadena ${chain}${ex ? ` — ejercicio ${ex.id} (${ex.topic} nivel ${ex.level}, ${ex.kind}: "${ex.prompt}")` : ""}`);
    items.forEach((it, i) => {
      if (it.kind !== "math") return;
      let check = "";
      if (i > 0) {
        const prev = items[i - 1] as typeof it;
        const r = cas.compareSteps(prev.latex, it.latex);
        check = r.status === "equivalent" ? "  ✓ equivalente" : r.status === "different" ? `  ✗ ${r.reason}` : `  ? ${r.reason}`;
      }
      lines.push(`  ${i + 1}. ${describeItem(it)}${check}${mark(it)}`);
    });
    if (ex) {
      const last = items.at(-1);
      const p = last && last.kind === "math" ? checkExerciseStep(ex, last.latex) : null;
      lines.push(`  estado: ${p ? `${p.status} — ${p.reason}` : "sin pasos"} · respuesta esperada (no revelar en modo tutor): ${exerciseAnswerTeX(ex)}`);
    }
  }
  if (loose.length) {
    lines.push("\nSueltos");
    for (const it of loose.sort((a, b) => a.y - b.y || a.x - b.x)) {
      let extra = "";
      if (it.kind === "math") {
        const p = cas.parseMath(it.latex);
        extra = p.kind === "invalid" ? `  (no parsea: ${p.error})` : `  (${p.kind})`;
      }
      lines.push(`  ${describeItem(it)}${extra}${mark(it)}`);
    }
  }
  const pending = board.exercises.filter((e) => !board.items.some((i) => (i.kind === "math" || i.kind === "card") && i.exercise === e.id));
  for (const ex of pending) lines.push(`\nEjercicio sin empezar ${ex.id}: ${ex.prompt}: ${ex.latex}`);
  const head = `Pizarra (${board.items.length} ítems, actualizada ${board.updatedAt}) · vista x=${Math.round(board.view.x)} y=${Math.round(board.view.y)} zoom=${board.view.zoom.toFixed(2)}`;
  return head + (lines.length ? lines.join("\n") : "\n  (vacía)");
}

// ---------------------------------------------------------------- watch

async function watch(model = process.env.GEBRA_MODEL ?? "") {
  console.log(`[gebra] escuchando preguntas en ${BASE}${model ? ` como ${model}` : ""} …`);
  for (;;) {
    try {
      const res = await fetch(BASE + "/api/agent/stream" + (model ? `?model=${encodeURIComponent(model)}` : ""));
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const ev = JSON.parse(line.slice(6)) as { type: string; ask: Ask };
          if (ev.type !== "ask") continue;
          const a = ev.ask;
          console.log(`ASK ${a.id} mode=${a.mode} focus=${a.focus.join(",") || "-"} :: ${a.text.replace(/\s+/g, " ")}`);
        }
      }
    } catch (e) {
      console.log(`[gebra] conexión perdida (${e instanceof Error ? e.message : e}); reintento en 3s`);
    }
    await Bun.sleep(3000);
  }
}

// ---------------------------------------------------------------- cas

function runCas(op: string | undefined, args: string[]) {
  const need = (n: number) => {
    if (args.length < n) fail(`gebra cas ${op}: faltan argumentos`);
  };
  switch (op) {
    case "solve": {
      need(1);
      const s = cas.solveEquation(args[0]!, args[1]);
      if (s.all) return console.log(`${s.variable}: se cumple para todo valor`);
      if (!s.solutions.length) return console.log(`${s.variable}: sin solución`);
      console.log(s.latex.map((l) => `${s.variable}=${l}`).join(",\\ "));
      return console.log(`(nerdamer: ${s.solutions.join(", ")})`);
    }
    case "check": {
      need(2);
      const r = cas.compareSteps(args[0]!, args[1]!);
      return console.log(`${r.status}: ${r.reason}`);
    }
    case "factor":
      need(1);
      return console.log(cas.factor(args[0]!));
    case "expand":
      need(1);
      return console.log(cas.expand(args[0]!));
    case "simplify":
      need(1);
      return console.log(cas.simplify(args[0]!));
    case "divide": {
      need(2);
      const d = cas.divide(args[0]!, args[1]!);
      return console.log(`cociente: ${d.quotient}\nresto: ${d.remainder}`);
    }
    case "roots":
      need(1);
      return console.log(cas.realRoots(args[0]!).join(", ") || "(sin raíces reales)");
    case "eval": {
      need(1);
      const scope: Record<string, number> = {};
      for (const a of args.slice(1)) {
        const [k, v] = a.split("=");
        scope[k!] = Number(v);
      }
      return console.log(cas.evaluate(args[0]!, scope));
    }
    case "tex":
      need(1);
      return console.log(cas.toTeX(args[0]!));
    default:
      fail(`operación cas desconocida: ${op}\n\n${HELP}`);
  }
}

// ---------------------------------------------------------------- main

async function main(argv: string[]) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "board": {
      const board = await api<Board>("/api/board");
      return console.log(rest.includes("--json") ? JSON.stringify(board, null, 2) : renderBoard(board));
    }
    case "watch": {
      const i = rest.indexOf("--model");
      return watch(i >= 0 ? (rest[i + 1] ?? "") : undefined);
    }
    case "present": {
      const src = rest[0];
      if (!src) fail("uso: gebra present <file|->");
      const text = src === "-" ? await Bun.stdin.text() : readFileSync(src, "utf8");
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch (e) {
        fail(`JSON inválido: ${e instanceof Error ? e.message : e}`);
      }
      const r = await postJson("/api/present", data);
      return console.log(`presentación ${r.id} enviada (${r.viewers} pestaña(s) mirando)`);
    }
    case "say": {
      const text = rest.join(" ");
      if (!text.trim()) fail("uso: gebra say <texto>");
      const r = await postJson("/api/say", { text });
      return console.log(`mensaje enviado (${r.viewers} pestaña(s) mirando)`);
    }
    case "exercise": {
      const flag = (name: string) => {
        const i = rest.indexOf(`--${name}`);
        return i >= 0 ? rest[i + 1] : undefined;
      };
      const latex = flag("latex");
      const body = latex
        ? { latex, prompt: flag("prompt"), kind: flag("kind"), answer: flag("answer")?.split(",") }
        : { topic: rest[0] ?? "lineal", level: Number(rest[1] ?? 1) };
      const r = await postJson("/api/exercise", body);
      return console.log(`ejercicio ${r.exercise.id}: ${r.exercise.prompt}: ${r.exercise.latex}  (respuesta: ${r.exercise.answer.join(", ")}) → ${r.viewers} pestaña(s)`);
    }
    case "status": {
      await postJson("/api/status", { text: rest.join(" ") });
      return console.log(rest.length ? "estado mostrado" : "estado borrado");
    }
    case "chat": {
      const n = Number(rest[0] ?? 10);
      const msgs = await api<ChatMessage[]>("/api/chat");
      for (const m of msgs.slice(-n))
        console.log(`${m.at.slice(11, 19)} ${m.from === "me" ? "VOS" : "PROFE"}${m.mode ? `[${m.mode}]` : ""}: ${m.text}`);
      return;
    }
    case "cas":
      try {
        return runCas(rest[0], rest.slice(1));
      } catch (e) {
        fail(`Error CAS: ${e instanceof Error ? e.message : e}`);
      }
    case undefined:
    case "help":
    case "--help":
    case "-h":
      return console.log(HELP);
    default:
      fail(`comando desconocido: ${cmd}\n\n${HELP}`);
  }
}

if (import.meta.main) await main(process.argv.slice(2));
