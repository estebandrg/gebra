# gebra — pizarra de álgebra con profe en vivo

Personal whiteboard for learning **equations and polynomials**. You write math with the keyboard; every step is checked
by a CAS; and the "profe" — the coding agent in your terminal session — reads the board and answers with **live
presentations drawn on top of it** (chalk writing, highlights, arrows, strikes, animated plots, captions).

## Run

```bash
bun install
bun start            # http://localhost:5179
```

Then, in your agent terminal session, say **"conectate a la pizarra"**. The agent follows [AGENTS.md](AGENTS.md):
it listens with `gebra watch` and replies with `gebra present` / `gebra say`.

## Using the board

| Action | How |
| --- | --- |
| New equation | double-click anywhere, or `N` |
| Next step | `Enter` (copies the line so you transform it); `Shift+Enter`/`Esc` to finish |
| Step check | ✓ equivalent · ✗ the step changed the solutions (hover for the reason) · ? could not verify |
| Note | `T` (supports `$x^2$`) |
| Plot | select a line, `G` (equations plot both sides and mark intersections) |
| Exercise | `E` → topic and level; solving it shows "¡Resuelto! 🎉" |
| Select / move / delete | click, `Shift`+click, drag the ⋮⋮ handle, `Supr`; `Ctrl+Z` undoes |
| Pan / zoom | drag the background / wheel · `Ctrl`+wheel, `H` home |
| Ask the profe | chat panel: Explicame (full presentation), Pista (hints only), ¿Está bien? (review), Charla |
| Presentation | `space` pause · `←` `→` steps · `Esc` close · **Conservar** copies it to your board |

While typing math: `/` fraction, `^` power, `sqrt` root, `*` product.

## Layout

```
src/shared/   cas.ts (nerdamer, LaTeX in/out, step equivalence) · dsl.ts (presentation validation)
              exercises.ts (generator + progress check) · types.ts (contracts)
src/server/   app.ts (board, inbox, SSE to web and agent) · index.ts (Bun full-stack entry)
src/web/      board.ts · player.ts · plot.ts · chat.ts · render.ts · main.ts · style.css
bin/gebra.ts  the agent's CLI
.gebra/       local data: board.json, inbox.jsonl, chat.jsonl, presentations/ (git-ignored)
```

## Checks

```bash
bun test          # CAS, DSL, exercises, server protocol
bunx tsc --noEmit
```
