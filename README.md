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

### Scope of the Asistente

The agent behind the chat **must not do anything other than teach the course content shown on the whiteboard**
(equations, polynomials, the TP exercises and the board's tools). No coding, no editing files, no unrelated questions or
tasks: if asked, it declines briefly and goes back to the board. This rule is in [AGENTS.md](AGENTS.md) §0.

### Skills

Teaching instructions for the agent live in `skills/<name>/SKILL.md`. The agent loads one with `gebra skill <name>`
(`gebra skill` lists them) and the chat shows a **📘 Skill cargada: …** notice, so you can see when it is active.
Bundled: **didactica** — how to diagnose the doubt, explain one idea per step, choose and verify examples, anticipate
typical mistakes and give hints without revealing the answer.

## Using the board

| Action | How |
| --- | --- |
| New equation | double-click anywhere, or `N` |
| Next step | `Enter` (copies the line so you transform it); `Shift+Enter`/`Esc` to finish |
| Step check | ✓ equivalent · ✗ the step changed the solutions (hover for the reason) · ? could not verify |
| ¿Por qué? | next to a ✗ step: **¿Por qué?** asks the Asistente why it is wrong — **Por chat** (short answer, no demonstration) or **En la pizarra** (a 1–2 step drawing on the exact mistake) |
| Note | `T` (supports `$x^2$`) |
| Plot | select a line, `G` (equations plot both sides and mark intersections) |
| Exercise card | `E` → topic and level. The card has a fixed statement on top and your steps inside (`+ Paso`, `Enter`); each step is CAS-checked and the card turns green when solved. Drag it by its header, resize it from the corner (double-click the corner: auto size) |
| TP exercises | `X` or **TP**: two worksheets as tabs on top — **TP 2** "Ecuaciones y Factorización" (80 exercises) and **TP 3** "Polinomios" (47) — each split into sections (TP 2: Ecuaciones, Productos notables, Factorización, Cuadráticas, Simplificar · TP 3: Operaciones, División, Raíces), with search across both (`5a`, `trinomio`, `ruffini`); a click puts the exercise on the board as a card. Only exercises with a mathematical expression are loaded (no word problems or conceptual ones). Equations with no solution or infinitely many (TP 2 1c, 1d…) are solved by reaching a false/true numeric line (`0=5`, `0=0`) or by writing "sin solución" / "infinitas soluciones" |
| Ruffini | card button on divisions, or select a polynomial and press **Ruffini**: fill the real table cell by cell (coefficients with 0 for missing terms, root, bring down, multiply, add); every cell is checked with a hint, and the result goes into the card (an exact division in a factoring card is written as a factored step) |
| Resolvente | card button on quadratics: a, b, c → Δ (with the substitution shown) → how many roots → x₁, x₂, each box checked |
| Gauss | card button on cubic or higher polynomials, or **Gauss** on a selected polynomial: candidates ±p/q as chips, one click computes P(r), a root opens Ruffini |
| Theory | `F` or **Teoría**: searchable formulas (linear, quadratic, notable products, factoring, division); opens on the selected card's topic; **Insertar** puts a formula on the board |
| Select / move / delete | click, `Shift`+click, `Supr`; press and drag any equation, note, drawing, plot or card to move it (a click without moving edits); `Ctrl+Z` undoes |
| Draw | `D` or **Dibujar**: freehand pen on the board; bar with colors, three thicknesses, an undo button (also `Ctrl+Z`, `Ctrl+Shift+Z` to redo), an eraser (pass over a stroke to delete it) and **Listo** (`Esc`). Each stroke is its own item: click it to select, drag to move |
| Pan / zoom | drag the background / wheel · `Ctrl`+wheel, `H` home |
| Ask the Asistente | chat panel: Explicame (full presentation), Pista (hints only), ¿Está bien? (review), Charla |
| Copy LaTeX | click any formula in the chat or in a presentation caption, or `Ctrl+C` on selected board equation(s) (one per line), or **Copiar LaTeX** in the Teoría: the LaTeX goes to the clipboard between `$…$` |
| Paste equations | `Ctrl+V` on the board creates an equation from the clipboard; inside an equation being edited it is inserted at the cursor. Delimiters `$…$`, `$$…$$`, `\(…\)` and `\[…\]` are stripped; in the chat box `$$…$$` renders as math |
| Point at something | **Señalar** (the crosshair next to the 📎 in the chat box) opens a mode on the board: **drag a rectangle** over what you mean — each drag adds a numbered yellow zone (a plain click points at one item). Make as many as you like (up to 8), **Ctrl+Z** / ↶ undoes the last one, **Esc** / **Cancelar** drops them all, **Listo** / `Enter` keeps them. Selecting text in the chat, a presentation caption or the Teoría sheet and pressing **Señalar** (or the floating **Preguntar sobre esto**) points at that text too (a formula counts whole). Everything pointed at sits above the chat box ("Señalaste", each with its ✕) and travels with your next question, whatever you ask; the agent receives it as `selection=[…]` (board zones add their item ids to `focus`) and it is shown in the conversation. For a board zone the web computes what is inside (`detail`): exact LaTeX, CAS ✓/✗ verdicts, the assistant's own presentation (its lines, highlights, arrows and the step's explanation — pointing pauses a running presentation), and the geometry of hand drawings ("línea recta horizontal", "subraya [m3]", "encierra [m1]"), so the agent never has to guess what is there. **Dragging inside one equation** (on the board or in the assistant's presentation) marks *fragments* instead of drawing a zone: the atoms under the drag light up, and the agent receives the complete equation plus exactly the parts you marked and where they sit (numerador, exponente, lado izquierdo de la igualdad…) |
| Math in the chat box | only the formula the caret is in (or touching) shows its LaTeX, with the rendered formula drawn right below it (live, even before closing the `$`); every other `$…$` is replaced by the rendered formula highlighted in yellow. Click a rendered formula (or move the caret onto it) to get its LaTeX back |
| Reply to a message | hover a chat message and press **↩**: the quote appears above the box, goes with your next question (the agent sees it as `quote=`) and is shown in the conversation |
| Images in the chat | the 📎 button, paste (`Ctrl+V`) or drop an image on the message box; thumbnails show before sending. They are stored in `.gebra/uploads/` and `gebra watch` prints their absolute paths (`images=…`) so the agent can open them |
| Resize the chat | drag the left edge of the Asistente sidebar (300–760 px, remembered); double-click the edge to reset |
| New conversation | **Nueva** in the chat header (click twice to confirm): deletes the chat history and starts an empty conversation in every open tab. Questions stay archived in `.gebra/inbox.jsonl` and presentations in `.gebra/presentations/` |
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
skills/       agent skills (didactica/SKILL.md), loaded with `gebra skill <name>`
bin/gebra.ts  the agent's CLI
.gebra/       local data: board.json, inbox.jsonl, chat.jsonl, presentations/ (git-ignored)
```

## Checks

```bash
bun test          # CAS, DSL, exercises, cards, tools, theory, server protocol
bunx tsc --noEmit
```
