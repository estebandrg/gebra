// Local server: persists the board, relays learner questions to the agent and pushes the
// agent's presentations/messages to the web over Server-Sent Events.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { validatePresentation } from "../shared/dsl";
import { generateExercise } from "../shared/exercises";
import { parseMath, solveEquation } from "../shared/cas";
import type { Ask, AskMode, Board, ChatMessage, Exercise, Pointed, Presentation, Quote, ServerEvent, Topic } from "../shared/types";

export interface ServerOptions {
  port: number;
  dataDir: string;
  /** Extra Bun routes (the HTML page in production). */
  routes?: Record<string, any>;
  development?: boolean;
}

/** Topic of a custom exercise from its kind and the highest power of x. */
function inferTopic(kind: Exercise["kind"], latex: string): Topic {
  if (kind === "divide") return "division";
  if (kind === "factor") return "factorizar";
  if (kind === "expand" || kind === "simplify") return "operaciones";
  const powers = [...latex.matchAll(/x\s*\^\s*\{?\s*(\d+)/g)].map((m) => Number(m[1]));
  return Math.max(1, ...powers) >= 2 ? "cuadratica" : "lineal";
}

/** Image types the chat accepts, with the extension each is stored under. */
const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const UPLOAD_NAME = /^img[a-z0-9]+\.(png|jpg|webp|gif)$/;

/** A quoted message from the request body, or nothing if it is not a usable quote. */
function parseQuote(raw: unknown): Quote | undefined {
  const q = raw as Partial<Quote> | null | undefined;
  const text = typeof q?.text === "string" ? q.text.trim().slice(0, 600) : "";
  if (!text || (q?.from !== "me" && q?.from !== "profe")) return undefined;
  return { from: q.from, text };
}

/** What the learner pointed at: up to 8 entries of text (formulas as `$latex$`) and, for board zones, item ids. */
function parsePointed(raw: unknown): Pointed[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Pointed[] = [];
  for (const p of raw.slice(0, 8)) {
    const text = typeof p?.text === "string" ? p.text.replace(/\s+/g, " ").trim().slice(0, 400) : "";
    if (!text) continue;
    const ids = Array.isArray(p.ids) ? p.ids.map(String).filter((x: string) => /^[\w-]{1,40}$/.test(x)).slice(0, 30) : [];
    const detail = typeof p.detail === "string" ? p.detail.trim().slice(0, 3000) : "";
    const equation = typeof p.equation === "string" ? p.equation.trim().slice(0, 600) : "";
    const parts = equation && Array.isArray(p.parts) ? p.parts.filter((x: unknown) => typeof x === "string" && x.trim()).map((x: string) => x.trim().slice(0, 400)).slice(0, 8) : [];
    const marked = equation && typeof p.marked === "string" ? p.marked.trim().slice(0, 700) : "";
    out.push({
      text,
      ...(ids.length ? { ids } : {}),
      ...(detail ? { detail } : {}),
      ...(equation && parts.length ? { equation, parts, ...(marked ? { marked } : {}) } : {}),
    });
  }
  return out.length ? out : undefined;
}

const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;

const MODES: AskMode[] = ["explain", "tutor", "check", "exercise", "chat", "why"];

export function emptyBoard(): Board {
  return { version: 1, items: [], exercises: [], selection: [], view: { x: 0, y: 0, zoom: 1 }, updatedAt: new Date().toISOString() };
}

const id = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function startServer(opts: ServerOptions) {
  const dir = opts.dataDir;
  mkdirSync(join(dir, "presentations"), { recursive: true });
  mkdirSync(join(dir, "uploads"), { recursive: true });
  const file = (name: string) => join(dir, name);

  const readBoard = (): Board => {
    try {
      return { ...emptyBoard(), ...JSON.parse(readFileSync(file("board.json"), "utf8")) };
    } catch {
      return emptyBoard();
    }
  };

  const readChat = (): ChatMessage[] => {
    if (!existsSync(file("chat.jsonl"))) return [];
    return readFileSync(file("chat.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as ChatMessage)
      .slice(-200);
  };

  // ---- SSE plumbing
  type Client = { send: (data: unknown) => void; close: () => void };
  const webClients = new Set<Client>();
  const agentClients = new Set<Client>();
  const enc = new TextEncoder();

  function sse(set: Set<Client>, onOpen?: (c: Client) => void, onClose?: (c: Client) => void): Response {
    let client: Client;
    let ping: ReturnType<typeof setInterval>;
    const stream = new ReadableStream({
      start(ctrl) {
        client = {
          send: (data) => {
            try {
              ctrl.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
            } catch {
              /* stream already closed */
            }
          },
          close: () => ctrl.close(),
        };
        ctrl.enqueue(enc.encode(": connected\n\n"));
        set.add(client);
        ping = setInterval(() => {
          try {
            ctrl.enqueue(enc.encode(": ping\n\n"));
          } catch {
            /* closed */
          }
        }, 15000);
        onOpen?.(client);
      },
      cancel() {
        clearInterval(ping);
        set.delete(client);
        onClose?.(client);
      },
    });
    return new Response(stream, {
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
    });
  }

  const broadcast = (event: ServerEvent) => webClients.forEach((c) => c.send(event));
  /** Model each connected agent declared (`gebra watch --model`); the newest one is shown. */
  const agentModels = new Map<Client, string>();
  const currentModel = () => [...agentModels.values()].filter(Boolean).at(-1);
  const presenceEvent = (): ServerEvent => ({ type: "presence", agents: agentClients.size, model: currentModel() });
  const presence = () => broadcast(presenceEvent());

  const addChat = (msg: ChatMessage) => {
    appendFileSync(file("chat.jsonl"), JSON.stringify(msg) + "\n");
    broadcast({ type: "chat", message: msg });
  };

  const json = (data: unknown, status = 200) => Response.json(data, { status });

  return Bun.serve({
    port: opts.port,
    idleTimeout: 0,
    development: opts.development,
    routes: {
      ...opts.routes,

      "/api/board": {
        GET: () => json(readBoard()),
        PUT: async (req) => {
          const board = (await req.json()) as Board;
          if (!board || !Array.isArray(board.items)) return json({ error: "board inválido" }, 400);
          board.updatedAt = new Date().toISOString();
          writeFileSync(file("board.json"), JSON.stringify(board, null, 2));
          return json({ ok: true, updatedAt: board.updatedAt });
        },
      },

      "/api/events": {
        GET: () => sse(webClients, (c) => c.send(presenceEvent())),
      },

      "/api/agent/stream": {
        GET: (req) => {
          const model = (new URL(req.url).searchParams.get("model") ?? "").trim().slice(0, 80);
          return sse(
            agentClients,
            (c) => {
              agentModels.set(c, model);
              queueMicrotask(presence);
            },
            (c) => {
              agentModels.delete(c);
              presence();
            },
          );
        },
      },

      "/api/state": { GET: () => json({ agents: agentClients.size, model: currentModel(), dataDir: dir }) },

      // Pasted chat images: raw bytes in, a file name out (stored under <data>/uploads/).
      "/api/upload": {
        POST: async (req) => {
          const type = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
          const ext = IMAGE_TYPES[type];
          if (!ext) return json({ error: "solo se aceptan imágenes png, jpeg, webp o gif" }, 400);
          const bytes = new Uint8Array(await req.arrayBuffer());
          if (!bytes.length) return json({ error: "imagen vacía" }, 400);
          if (bytes.length > MAX_IMAGE_BYTES) return json({ error: "la imagen pesa más de 10 MB" }, 413);
          const name = `${id("img")}.${ext}`;
          writeFileSync(join(dir, "uploads", name), bytes);
          return json({ ok: true, name, url: `/api/uploads/${name}` });
        },
      },

      "/api/uploads/:name": {
        GET: (req) => {
          const name = basename(req.params.name);
          const path = join(dir, "uploads", name);
          if (!UPLOAD_NAME.test(name) || !existsSync(path)) return json({ error: "no existe" }, 404);
          return new Response(Bun.file(path));
        },
      },

      "/api/chat": {
        GET: () => json(readChat()),
        // Start a new conversation: the history is deleted (asks stay archived in inbox.jsonl, presentations in their folder).
        DELETE: () => {
          writeFileSync(file("chat.jsonl"), "");
          broadcast({ type: "chat-reset" });
          return json({ ok: true });
        },
      },

      "/api/ask": {
        POST: async (req) => {
          const body = (await req.json()) as Partial<Ask>;
          const images = Array.isArray(body.images) ? body.images.map(String).filter((n) => UPLOAD_NAME.test(n) && existsSync(join(dir, "uploads", n))) : [];
          const text = String(body.text ?? "").trim() || (images.length ? "Mirá esta imagen" : "");
          if (!text) return json({ error: "text vacío" }, 400);
          const quote = parseQuote(body.quote);
          const pointed = parsePointed(body.pointed);
          const ask: Ask = {
            id: id("q"),
            at: new Date().toISOString(),
            text,
            mode: MODES.includes(body.mode as AskMode) ? (body.mode as AskMode) : "chat",
            focus: Array.isArray(body.focus) ? body.focus.map(String) : [],
            ...(images.length ? { images } : {}),
            ...(quote ? { quote } : {}),
            ...(pointed ? { pointed } : {}),
          };
          appendFileSync(file("inbox.jsonl"), JSON.stringify(ask) + "\n");
          addChat({ id: ask.id, at: ask.at, from: "me", text, mode: ask.mode, ...(images.length ? { images } : {}), ...(quote ? { quote } : {}), ...(pointed ? { pointed } : {}) });
          agentClients.forEach((c) => c.send({ type: "ask", ask }));
          return json({ ok: true, id: ask.id, agents: agentClients.size });
        },
      },

      "/api/present": {
        POST: async (req) => {
          const pres = (await req.json()) as Presentation;
          const errors = validatePresentation(pres, readBoard().items.map((i) => i.id));
          if (errors.length) return json({ errors }, 400);
          pres.id = id("p");
          writeFileSync(join(dir, "presentations", `${pres.id}.json`), JSON.stringify(pres, null, 2));
          broadcast({ type: "presentation", presentation: pres });
          addChat({ id: id("m"), at: new Date().toISOString(), from: "profe", text: pres.title, presentationId: pres.id });
          return json({ ok: true, id: pres.id, viewers: webClients.size });
        },
      },

      "/api/presentations/:id": {
        GET: (req) => {
          const pid = req.params.id.replace(/[^\w-]/g, "");
          const path = join(dir, "presentations", `${pid}.json`);
          if (!existsSync(path)) return json({ error: "no existe" }, 404);
          return new Response(readFileSync(path), { headers: { "content-type": "application/json" } });
        },
      },

      "/api/status": {
        POST: async (req) => {
          const body = (await req.json()) as { text?: string };
          broadcast({ type: "status", text: String(body.text ?? "") });
          return json({ ok: true });
        },
      },

      "/api/exercise": {
        POST: async (req) => {
          const body = (await req.json()) as Partial<Exercise> & { seed?: number };
          let ex: Exercise;
          if (body.latex) {
            const parsed = parseMath(body.latex);
            if (parsed.kind === "invalid" || parsed.kind === "empty") return json({ error: `latex inválido: ${body.latex}` }, 400);
            const kind = body.kind ?? "solve";
            let answer = body.answer;
            if (kind === "solve" && !answer?.length) {
              try {
                const sol = solveEquation(body.latex);
                answer = sol.all ? ["all"] : sol.solutions.length ? sol.solutions : ["none"];
              } catch (e) {
                return json({ error: `no pude resolverla: ${e instanceof Error ? e.message : e}` }, 400);
              }
            }
            if (!answer?.length) return json({ error: "answer es obligatorio para este tipo" }, 400);
            ex = { id: id("ex"), topic: body.topic ?? inferTopic(kind, body.latex), level: body.level ?? 1, kind, prompt: body.prompt ?? "Resolvé", latex: body.latex, answer };
          } else {
            const topic = (body.topic ?? "lineal") as Topic;
            if (!["lineal", "cuadratica", "factorizar", "operaciones", "division"].includes(topic)) return json({ error: `tema desconocido: ${topic}` }, 400);
            const level = ([1, 2, 3].includes(Number(body.level)) ? Number(body.level) : 1) as 1 | 2 | 3;
            ex = { ...generateExercise(topic, level, body.seed), id: id("ex") };
          }
          broadcast({ type: "exercise", exercise: ex });
          return json({ ok: true, exercise: ex, viewers: webClients.size });
        },
      },

      // The agent loaded a skill: leave a visible notice in the chat (persisted, so it survives a reload).
      "/api/skill": {
        POST: async (req) => {
          const body = (await req.json()) as { name?: string; title?: string };
          const name = String(body.name ?? "").trim();
          if (!SKILL_NAME.test(name)) return json({ error: "nombre de skill inválido" }, 400);
          const title = String(body.title ?? "").trim().slice(0, 60) || name;
          const msg: ChatMessage = { id: id("m"), at: new Date().toISOString(), from: "profe", text: `Skill cargada: ${title}`, skill: { name, title } };
          addChat(msg);
          return json({ ok: true, id: msg.id, viewers: webClients.size });
        },
      },

      "/api/say": {
        POST: async (req) => {
          const body = (await req.json()) as { text?: string };
          const text = String(body.text ?? "").trim();
          if (!text) return json({ error: "text vacío" }, 400);
          const msg: ChatMessage = { id: id("m"), at: new Date().toISOString(), from: "profe", text };
          addChat(msg);
          return json({ ok: true, id: msg.id, viewers: webClients.size });
        },
      },
    },
    fetch: () => json({ error: "not found" }, 404),
  });
}
