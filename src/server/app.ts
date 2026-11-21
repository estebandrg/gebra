// Local server: persists the board, relays learner questions to the agent and pushes the
// agent's presentations/messages to the web over Server-Sent Events.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validatePresentation } from "../shared/dsl";
import type { Ask, AskMode, Board, ChatMessage, Presentation, ServerEvent } from "../shared/types";

export interface ServerOptions {
  port: number;
  dataDir: string;
  /** Extra Bun routes (the HTML page in production). */
  routes?: Record<string, any>;
  development?: boolean;
}

const MODES: AskMode[] = ["explain", "tutor", "check", "exercise", "chat"];

export function emptyBoard(): Board {
  return { version: 1, items: [], exercises: [], selection: [], view: { x: 0, y: 0, zoom: 1 }, updatedAt: new Date().toISOString() };
}

const id = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function startServer(opts: ServerOptions) {
  const dir = opts.dataDir;
  mkdirSync(join(dir, "presentations"), { recursive: true });
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

  function sse(set: Set<Client>, onOpen?: (c: Client) => void, onClose?: () => void): Response {
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
        onClose?.();
      },
    });
    return new Response(stream, {
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
    });
  }

  const broadcast = (event: ServerEvent) => webClients.forEach((c) => c.send(event));
  const presence = () => broadcast({ type: "presence", agents: agentClients.size });

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
        GET: () => sse(webClients, (c) => c.send({ type: "presence", agents: agentClients.size })),
      },

      "/api/agent/stream": {
        GET: () => {
          const res = sse(agentClients, () => queueMicrotask(presence), presence);
          return res;
        },
      },

      "/api/state": { GET: () => json({ agents: agentClients.size }) },

      "/api/chat": { GET: () => json(readChat()) },

      "/api/ask": {
        POST: async (req) => {
          const body = (await req.json()) as Partial<Ask>;
          const text = String(body.text ?? "").trim();
          if (!text) return json({ error: "text vacío" }, 400);
          const ask: Ask = {
            id: id("q"),
            at: new Date().toISOString(),
            text,
            mode: MODES.includes(body.mode as AskMode) ? (body.mode as AskMode) : "chat",
            focus: Array.isArray(body.focus) ? body.focus.map(String) : [],
          };
          appendFileSync(file("inbox.jsonl"), JSON.stringify(ask) + "\n");
          addChat({ id: ask.id, at: ask.at, from: "me", text, mode: ask.mode });
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
