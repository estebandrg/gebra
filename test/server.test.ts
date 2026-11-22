import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../src/server/app";

let server: ReturnType<typeof startServer>;
let base = "";
let dir = "";

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "gebra-test-"));
  server = startServer({ port: 0, dataDir: dir });
  base = `http://localhost:${server.port}`;
});
afterAll(() => {
  server.stop(true);
  rmSync(dir, { recursive: true, force: true });
});

/** Open an SSE stream and resolve with the first event whose JSON matches `pred`. */
function nextEvent(path: string, pred: (data: any) => boolean, onOpen?: () => unknown) {
  return new Promise<any>(async (resolve, reject) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => (ctrl.abort(), reject(new Error("timeout"))), 3000);
    const res = await fetch(base + path, { signal: ctrl.signal });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let opened = false;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        if (!opened) {
          opened = true;
          await onOpen?.();
        }
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const data = JSON.parse(line.slice(6));
          if (pred(data)) {
            clearTimeout(timer);
            ctrl.abort();
            return resolve(data);
          }
        }
      }
    } catch (e) {
      if (!ctrl.signal.aborted) reject(e);
    }
  });
}

const post = (path: string, body: unknown) =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("board", () => {
  test("starts empty and round-trips", async () => {
    const empty = await (await fetch(base + "/api/board")).json();
    expect(empty.items).toEqual([]);
    const board = { ...empty, items: [{ id: "m1", kind: "math", x: 10, y: 20, latex: "2x+3=7" }] };
    const put = await fetch(base + "/api/board", { method: "PUT", body: JSON.stringify(board) });
    expect(put.status).toBe(200);
    const got = await (await fetch(base + "/api/board")).json();
    expect(got.items[0].latex).toBe("2x+3=7");
    expect(existsSync(join(dir, "board.json"))).toBe(true);
  });
});

describe("agent protocol", () => {
  test("ask reaches the agent stream and is stored in the inbox", async () => {
    const ev = await nextEvent(
      "/api/agent/stream",
      (d) => d.type === "ask",
      () => post("/api/ask", { text: "¿Cómo despejo x?", mode: "tutor", focus: ["m1"] }),
    );
    expect(ev.ask.text).toBe("¿Cómo despejo x?");
    expect(ev.ask.mode).toBe("tutor");
    expect(ev.ask.focus).toEqual(["m1"]);
    const inbox = readFileSync(join(dir, "inbox.jsonl"), "utf8").trim().split("\n");
    expect(JSON.parse(inbox.at(-1)!).text).toBe("¿Cómo despejo x?");
  });

  test("a 'why' ask (why is this step wrong?) keeps its mode instead of falling back to chat", async () => {
    const ev = await nextEvent(
      "/api/agent/stream",
      (d) => d.type === "ask",
      () => post("/api/ask", { text: "¿Por qué está mal este paso?", mode: "why", focus: ["m3"] }),
    );
    expect(ev.ask.mode).toBe("why");
    expect(ev.ask.focus).toEqual(["m3"]);
  });
  test("deleting the chat clears the history, tells the web, and a new conversation starts empty", async () => {
    await post("/api/say", { text: "mensaje viejo" });
    expect(((await (await fetch(base + "/api/chat")).json()) as any[]).length).toBeGreaterThan(0);
    const ev = await nextEvent("/api/events", (d) => d.type === "chat-reset", () => fetch(base + "/api/chat", { method: "DELETE" }));
    expect(ev.type).toBe("chat-reset");
    expect(await (await fetch(base + "/api/chat")).json()).toEqual([]);
    await post("/api/say", { text: "mensaje nuevo" });
    const after = (await (await fetch(base + "/api/chat")).json()) as any[];
    expect(after.map((m) => m.text)).toEqual(["mensaje nuevo"]);
  });
  test("ask rejects empty text", async () => {
    const res = await post("/api/ask", { text: "  " });
    expect(res.status).toBe(400);
  });

  test("presence counts agent streams", async () => {
    const ev = await nextEvent("/api/events", (d) => d.type === "presence" && d.agents >= 1, async () => {
      const ctrl = new AbortController();
      fetch(base + "/api/agent/stream", { signal: ctrl.signal }).catch(() => {});
      setTimeout(() => ctrl.abort(), 500);
    });
    expect(ev.agents).toBeGreaterThanOrEqual(1);
  });

  test("presence reports the model the agent declared", async () => {
    const ev = await nextEvent("/api/events", (d) => d.type === "presence" && d.model === "Claude Opus 5.5", async () => {
      const ctrl = new AbortController();
      fetch(base + "/api/agent/stream?model=" + encodeURIComponent("Claude Opus 5.5"), { signal: ctrl.signal }).catch(() => {});
      setTimeout(() => ctrl.abort(), 500);
    });
    expect(ev.agents).toBeGreaterThanOrEqual(1);
    expect(ev.model).toBe("Claude Opus 5.5");
  });

  test("invalid presentation is rejected with errors and not broadcast", async () => {
    const res = await post("/api/present", { title: "x", steps: [{ say: "a", actions: [{ type: "highlight", target: "zzz" }] }] });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors).toEqual(['steps[0].actions[0]: target desconocido "zzz"']);
  });

  test("valid presentation is stored, broadcast and listed in chat", async () => {
    const pres = { title: "Despejar x", steps: [{ say: "Mirá $2x$", actions: [{ type: "highlight", target: "m1" }] }] };
    let id = "";
    const ev = await nextEvent(
      "/api/events",
      (d) => d.type === "presentation",
      async () => {
        const res = await post("/api/present", pres);
        expect(res.status).toBe(200);
        id = (await res.json()).id;
      },
    );
    expect(ev.presentation.title).toBe("Despejar x");
    expect(ev.presentation.id).toBe(id);
    const stored = await (await fetch(`${base}/api/presentations/${id}`)).json();
    expect(stored.steps.length).toBe(1);
    const chat = await (await fetch(base + "/api/chat")).json();
    expect(chat.some((m: any) => m.presentationId === id && m.from === "profe")).toBe(true);
  });

  test("say sends a chat message to the web", async () => {
    const ev = await nextEvent("/api/events", (d) => d.type === "chat" && d.message.from === "profe", () =>
      post("/api/say", { text: "¡Muy bien!" }),
    );
    expect(ev.message.text).toBe("¡Muy bien!");
  });
});

describe("exercises from the agent", () => {
  test("generated exercise is broadcast to the web", async () => {
    const ev = await nextEvent("/api/events", (d) => d.type === "exercise", () => post("/api/exercise", { topic: "cuadratica", level: 2, seed: 7 }));
    expect(ev.exercise.topic).toBe("cuadratica");
    expect(ev.exercise.kind).toBe("solve");
  });
  test("custom exercise gets its answer from the CAS", async () => {
    const res = await post("/api/exercise", { latex: "3x-5=10", prompt: "Resolvé" });
    expect((await res.json()).exercise.answer).toEqual(["5"]);
  });
  test("custom exercise with no solution or infinite solutions keeps a word answer", async () => {
    const answer = async (latex: string) => (await (await post("/api/exercise", { latex })).json()).exercise.answer;
    expect(await answer("2x+1=2x+5")).toEqual(["none"]);
    expect(await answer("2(x+1)=2x+2")).toEqual(["all"]);
  });
  test("custom exercise infers its topic unless one is given", async () => {
    const topic = async (body: object) => (await (await post("/api/exercise", body)).json()).exercise.topic;
    expect(await topic({ latex: "3x-5=10" })).toBe("lineal");
    expect(await topic({ latex: "x^2-5x+6=0" })).toBe("cuadratica");
    expect(await topic({ latex: "x^2-9", kind: "factor", answer: ["(x-3)(x+3)"] })).toBe("factorizar");
    expect(await topic({ latex: "(x+1)(x-1)", kind: "expand", answer: ["x^2-1"] })).toBe("operaciones");
    expect(await topic({ latex: "x^2-5x+6=0", topic: "factorizar" })).toBe("factorizar");
  });

    test("invalid latex and unknown topic are rejected", async () => {
    expect((await post("/api/exercise", { latex: "2x+=" })).status).toBe(400);
    expect((await post("/api/exercise", { topic: "trigonometria" })).status).toBe(400);
  });
});
