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

## Tasks

- T1 S1 — exercise card item: model, render, drag as a unit, read-only statement, steps inside with CAS ✓/✗, solved state, CLI board view, agent docs — inline — commit: pending
- T2 S2 S6 — guided Ruffini table widget (pure logic + UI), from division cards and from a selected polynomial; result goes into the card — inline — commit: pending
- T3 S3 — guided quadratic-formula widget — inline — commit: pending
- T4 S4 — Gauss candidates widget, hands a root to Ruffini — inline — commit: pending
- T5 S5 — theory/formulas side panel, insert into board — inline — commit: pending
- T6 S1-S6 — README/AGENTS docs, browser E2E check — inline — commit: pending

## Log

- L1 (user, verbatim): "deberias poder hacer una tarjeta con los enunciados, simplemente para que no sean componentes modificables. 1 de enunciado y abajo el de trabajo. Tambien añadi mas funcionalidades de UI/UX que me ayuden en el aprendizaje, ejemplo cuando necesite hacer ruffinni poder hacerlo de una forma intuitiva  simulando igual el cuadro real. y asi. Que esto sea increible"
- L2 (decisions): card = "Tarjeta única con trabajo adentro (Recomendado)"; Ruffini = "Guiado, celda por celda (Recomendado)"; extra tools = "Resolvente guiada, Gauss (candidatos p/q), Panel de teoría / fórmulas"; delivery = "Todo junto, commit por unidad (Recomendado)".
- L3 (evidence): prior Catppuccin restyle committed as eada073 on this branch before T1.
