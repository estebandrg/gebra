# Feature: pizarra-algebra

Personal algebra whiteboard (web) where the AI is the agent session itself (el Gentleman), connected through a local
server: it reads the board, verifies with a CAS, and plays live presentations on the board. Goal: learn equations and polynomials.

## Specs

- S1 Board: "Creame mi propia pizarra para algebra, en la misma debo poder escribir ecuaciones y plantear cosas realcionadas con algebra". Input mode: "Sobre todo teclado".
- S2 AI connection: "el chiste es que la IA este conctada, pueda ver lo que hay en la pizarra". Provider: "No lo estoy pensando como una IA con provedor, si no como uan charla con vos. que este conectada a mi web".
- S3 Live presentation: "pueda generarme explicaciones HACIENDO UNA PRESENTACION en vivo sobre la pizarra sobre lo que hay que hacer". Narration: "Solo texto en pantalla".
- S4 Extras: "Modo tutor (pistas)" — hints, not the solution, and correction of what the user wrote.
- S5 Extras: "Generador de ejercicios" — writes equation/polynomial exercises on the board by level.
- S6 Extras: "Verificación con CAS" — a symbolic engine checks steps so the AI does not invent algebra.
- S7 Extras: "Gráficas" — plot polynomials and equations on the board (roots, intercepts).
- S8 Scope: "Mi meta es aprender ecuaciones y polinomios." / "no como producto, es solo personal."

## Tasks

- T1 S2 — scaffold, Bun server, agent protocol (board/inbox/present/say/watch) + CLI — inline — commit: pending
- T2 S6 — CAS module (equivalence, solve, factor, expand, check) + CLI cas — inline — commit: pending
- T3 S1 S6 — board UI: pan/zoom canvas, MathLive keyboard input, items, step chains with CAS checks, persistence — inline — commit: pending
- T4 S3 S7 — presentation player: DSL, chalk write/highlight/arrow/strike/note/box/plot, captions, controls; graphs — inline — commit: pending
- T5 S4 S5 — chat panel, tutor mode, quick actions, exercise generator — inline — commit: pending
- T6 S2 — AGENTS.md protocol, README, end-to-end live session — inline — commit: pending

## Log

- L1 (user, verbatim): "Creame mi propia pizarra para algebra, en la misma debo poder escribir ecuaciones  y plantear cosas realcionadas con algebra, el chiste es que la IA este conctada, pueda ver lo que hay en la pizarra, pueda generarme explicaciones HACIENDO UNA PRESENTACION en vivo sobre la pizarra sobre lo que hay que hacer. Mi meta es aprender ecuaciones y polinomios. Imaginatelo, debe ser increible esto para aprender. no como producto, es solo personal."
- L2 (user answers): IA: "No lo estoy pensando como una IA con provedor, si no como uan charla con vos. que este conectada a mi web" · Escritura: "Sobre todo teclado" · Voz: "Solo texto en pantalla" · Extras: "Modo tutor (pistas), Generador de ejercicios, Verificación con CAS, Gráficas".
- L3 (decision): agent = this Pi session. Web → server → `.gebra/inbox.jsonl`; agent wakes via `monitor` on `gebra watch`; agent replies with `gebra present <json>` / `gebra say`, pushed to the web over SSE. Stack: Bun full-stack server, TypeScript, MathLive (input), KaTeX (render), nerdamer (CAS), own SVG plotter.
