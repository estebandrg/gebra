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
- T2 S2 S6 — guided Ruffini table widget (pure logic + UI), from division cards and from a selected polynomial; result goes into the card — inline — commit: 0b6cb31
- T3 S3 — guided quadratic-formula widget — inline — commit: 8171d0a
- T4 S4 — Gauss candidates widget, hands a root to Ruffini — inline — commit: fd9aa86
- T5 S5 — theory/formulas side panel, insert into board — inline — commit: 8bba9e2
- T6 S1-S8 — README/AGENTS docs, browser E2E check — inline — commit: e2719bb
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
- L9 (evidence T2): headless Firefox on isolated server: division card → "Ruffini" → typed 1, -7 (hint "Falta el término de x²: completá con 0."), then 0 -7 6 -2 1 -2 -2 4 -3 6 12 → "C(x)=x²−2x−3  R=12"; "Escribir el resultado en la tarjeta" → card solved; CLI shows "[w1] Ruffini: … completo". Workers unavailable; inline. 83 tests + tsc green.
- L10 (evidence T4): factor card x^3-7x+6 → "Gauss" → chips P(-1)=12, P(2)=0 (green) → "Dividir por (x − 2) con Ruffini" opens a fixed-root table in the card → filled → "Escribir la factorización en la tarjeta" writes (x−2)(x²+2x−3) ✓, status "todavía no terminaste". Decision: in factor/solve cards an exact Ruffini division is written as a factoring step (solve adds =0); Gauss passes the x^k prefix when it factored x out. 92 tests + tsc green.
- L11 (evidence T3): quadratic card 2x²−3x−2=0 → "Resolvente" → a=2, b=3 rejected ("Revisá el signo de b: …"), b=−3, c=−2, Δ=25 with live substitution, "Dos raíces reales", x₁=2, x₂=−1/2 → "Escribir las raíces en la tarjeta" → x=2, x=−½ ✓ and card solved. 101 tests + tsc green.
- L12 (evidence T5): headless Firefox: select a division card, press F → sheet opens with "División de polinomios" open and highlighted; search "diferencia de cuadrados" → 2 entries; "Insertar en la pizarra" → blue note on the board; Esc closes. Content: 5 sections, 20 entries; every formula renders in KaTeX and 15 concrete identities are CAS-verified in test/theory.test.ts. 106 tests + tsc green.
- L13 (evidence T6): E2E regression on isolated server: legacy free chain 3x−5=10 ↵ 3x=15 → ✓; presentation targeting the card id boxes its statement; chat question reaches `gebra watch` as "mode=explain focus=m3 :: ¿por dónde empiezo?"; model pill "Claude Opus 5.5"; toolbar does not overflow at 1100px; no console errors. 106 tests + tsc green.
