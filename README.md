# gebra — pizarra de álgebra con asistente en vivo

Personal whiteboard for learning **equations and polynomials**. You write math with the keyboard; every step is checked
by a CAS; and the "Asistente" — the coding agent in your terminal session — reads the board and answers with **live
presentations drawn on top of it** (chalk writing, highlights, arrows, strikes, animated plots, captions).

## Run

```bash
bun install
bun start            # http://localhost:5179
```

Then, in your agent terminal session, say **"conectate a la pizarra"**. The agent follows [AGENTS.md](AGENTS.md):
it listens with `gebra watch --model "<model name>"` (the chat header shows which AI model is answering) and replies
with `gebra present` / `gebra say`.

## Using the board

| Action | How |
| --- | --- |
| New equation | double-click anywhere, or `N` |
| Next step | `Enter` (copies the line so you transform it); `Shift+Enter`/`Esc` to finish |
| Step check | ✓ equivalent · ✗ the step changed the solutions (hover for the reason) · ? could not verify |
| Note | `T` (supports `$x^2$`) |
| Plot | select a line, `G` (equations plot both sides and mark intersections) |
| Exercise card | `E` → topic and level. The card has a fixed statement on top and your steps inside (`+ Paso`, `Enter`); each step is CAS-checked and the card turns green when solved. Drag it by its header, resize it from the corner (double-click the corner: auto size) |
| TP exercises | `X` or **TP**: two worksheets as tabs on top — **TP 2** "Ecuaciones y Factorización" (80 exercises) and **TP 3** "Polinomios" (47) — each split into sections (TP 2: Ecuaciones, Productos notables, Factorización, Cuadráticas, Simplificar · TP 3: Operaciones, División, Raíces), with search across both (`5a`, `trinomio`, `ruffini`); a click puts the exercise on the board as a card. Only exercises with a mathematical expression are loaded (no word problems or conceptual ones). Equations with no solution or infinitely many (TP 2 1c, 1d…) are solved by reaching a false/true numeric line (`0=5`, `0=0`) or by writing "sin solución" / "infinitas soluciones" |
| Ruffini | card button on divisions, or select a polynomial and press **Ruffini**: fill the real table cell by cell (coefficients with 0 for missing terms, root, bring down, multiply, add); every cell is checked with a hint, and the result goes into the card (an exact division in a factoring card is written as a factored step) |
| Resolvente | card button on quadratics: a, b, c → Δ (with the substitution shown) → how many roots → x₁, x₂, each box checked |
| Gauss | card button on cubic or higher polynomials, or **Gauss** on a selected polynomial: candidates ±p/q as chips, one click computes P(r), a root opens Ruffini |
| Theory | `F` or **Teoría**: searchable formulas (linear, quadratic, notable products, factoring, division); opens on the selected card's topic; **Insertar** puts a formula on the board |
| Select / move / delete | click, `Shift`+click, drag the ⋮⋮ handle, `Supr`; `Ctrl+Z` undoes |
| Pan / zoom | drag the background / wheel · `Ctrl`+wheel, `H` home |
| Ask the Asistente | chat panel: Explicame (full presentation), Pista (hints only), ¿Está bien? (review), Charla |
| Presentation | `space` pause · `←` `→` steps · `Esc` close · **Conservar** copies it to your board |

While typing math: `/` fraction, `^` power, `sqrt` root, `*` product.

## Layout

```
src/shared/   cas.ts (nerdamer, LaTeX in/out, step equivalence) · dsl.ts (presentation validation)
              exercises.ts (generator + progress check) · cards.ts (card lines + verdicts) · poly.ts
              tools/ (ruffini, resolvente, gauss: pure logic + summaries) · theory.ts · types.ts (contracts)
src/server/   app.ts (board, inbox, SSE to web and agent) · index.ts (Bun full-stack entry)
src/web/      board.ts · player.ts · plot.ts · chat.ts · render.ts · main.ts · style.css
              tools/ (one widget + css per tool, wired in tools/index.ts)
bin/gebra.ts  the agent's CLI
.gebra/       local data: board.json, inbox.jsonl, chat.jsonl, presentations/ (git-ignored)
```

## Checks

```bash
bun test          # CAS, DSL, exercises, cards, tools, theory, server protocol
bunx tsc --noEmit
```
