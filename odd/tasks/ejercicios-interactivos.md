# Feature: ejercicios-interactivos

Exercise cards (read-only statement + work area inside) and guided learning tools on the gebra board:
Ruffini table, quadratic formula, Gauss candidates, and a theory panel. Branch: `feat/ejercicios-interactivos`.

## Specs

- S1 Exercise card: "deberias poder hacer una tarjeta con los enunciados, simplemente para que no sean componentes modificables. 1 de enunciado y abajo el de trabajo." Decision: "Tarjeta única con trabajo adentro" — one block that moves as a whole: statement on top (not editable), the learner's steps below with ✓/✗, and the solved state on the card.
- S2 Ruffini: "cuando necesite hacer ruffinni poder hacerlo de una forma intuitiva simulando igual el cuadro real." Decision: "Guiado, celda por celda" — real table (coefficients, root, bring down, multiply, add); the learner fills each cell, the next cell is marked, each cell is validated instantly, and at the end it builds quotient and remainder.
- S3 Quadratic formula tool: "Resolvente guiada" — card for quadratics: identify a, b, c → discriminant Δ → x₁, x₂, each box verified.
- S4 Gauss tool: "Gauss (candidatos p/q)" — lists the p/q divisors, test each candidate with one click (P(r)=0?) and send the one that works to Ruffini.
- S5 Theory panel: "Panel de teoría / fórmulas" — side sheet: quadratic formula, notable products, factoring cases, Ruffini, remainder theorem; insertable into the board.
- S6 Overall: "Tambien añadi mas funcionalidades de UI/UX que me ayuden en el aprendizaje [...] Que esto sea increible". Delivery: "Todo junto, commit por unidad".
- S7 Assistant label: "cambia el nombre de card profe por Asistente, y que ponga que modelo de IA esta respondiendo."
- S8 Resizable cards: "hace las cards en pizarra resizables tambien."

## Tasks

- T1 S1 — exercise card item: model, render, drag as a unit, read-only statement, steps inside with CAS ✓/✗, solved state, CLI board view, agent docs — inline — commit: 4ff19d6
- T2 S2 S6 — guided Ruffini table widget (pure logic + UI), from division cards and from a selected polynomial; result goes into the card — inline — commit: pending
- T3 S3 — guided quadratic-formula widget — inline — commit: pending
- T4 S4 — Gauss candidates widget, hands a root to Ruffini — inline — commit: pending
- T5 S5 — theory/formulas side panel, insert into board — inline — commit: pending
- T6 S1-S8 — README/AGENTS docs, browser E2E check — inline — commit: pending
- T7 S7 — chat panel says "Asistente" and shows the model reported by `gebra watch` — inline — commit: a69dc72
- T8 S8 — resizable exercise cards (persisted size) — inline — commit: a69dc72

## Log

- L1 (user, verbatim): "deberias poder hacer una tarjeta con los enunciados, simplemente para que no sean componentes modificables. 1 de enunciado y abajo el de trabajo. Tambien añadi mas funcionalidades de UI/UX que me ayuden en el aprendizaje, ejemplo cuando necesite hacer ruffinni poder hacerlo de una forma intuitiva  simulando igual el cuadro real. y asi. Que esto sea increible"
- L2 (decisions): card = "Tarjeta única con trabajo adentro (Recomendado)"; Ruffini = "Guiado, celda por celda (Recomendado)"; extra tools = "Resolvente guiada, Gauss (candidatos p/q), Panel de teoría / fórmulas"; delivery = "Todo junto, commit por unidad (Recomendado)".
- L3 (evidence): prior Catppuccin restyle committed as eada073 on this branch before T1.
- L4 (evidence T1): card verified in headless Firefox on an isolated server (PORT=5191, temp GEBRA_DATA): exercise → card c1, typed 2x=4 ↵ x=2 → ✓ ✓ and "¡Resuelto!", CLI board shows card/lines/status; division card shows "Escribí C = …, R = … o usá Ruffini". Fixed: legacy "this is the statement" guard blocked editing the first card line; nested ✕/handle visible when the card was selected. 64 tests + tsc green.
- L5 (seam for T2-T5): tools are `ToolItem` (kind "tool", `tool`, optional `card`, `data`). Pure logic + `summarize(data)` in `src/shared/tools/<tool>.ts`; widget in `src/web/tools/<tool>.ts` `register(board)` which may push `board.cardActions` and set `board.toolRenderers`; create tools with `board.addTool(tool, data, cardId)`, persist with `board.toolChanged(item)`, add result lines with `board.addCardStep(cardId, latex, edit)`. Tool CSS goes in `src/web/tools/<tool>.css` imported from the widget module.
- L6 (evidence): all three workers (T2+T4, T3, T5) failed with provider quota; not retried — continuing inline.
- L7 (user, verbatim): "Otra cosita, cambia el nombre de card profe por Asistente, y que ponga que modelo de IA esta respondiendo. y hace las cards en pizarra resizables tambien."
- L8 (evidence T7/T8): isolated server 5191 + headless Firefox: `gebra watch --model "Claude Opus 5.5"` → chat header "Asistente" with model pill "Claude Opus 5.5" and "conectado"; card resized 440×218 → 628×346 by the corner grip and persisted (w=628, h=346); double-click on the grip resets. Also fixed: custom `--latex` exercises were always topic "lineal" (now inferred: cuadratica/factorizar/operaciones/division). Note: `bun --hot` reloads drop agent presence until `gebra watch` reconnects. 66 tests + tsc green.
