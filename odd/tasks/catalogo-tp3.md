# Feature: catalogo-tp3

Add "Trabajo Práctico 3: Polinomios" (UNRN, Matemática 2) to the exercises catalog modal next to TP 2. Branch: `feat/ejercicios-interactivos`.

## Specs

- S1 Source: "/home/admin/Descargas/ente/PRACTICA_3_polinomios.pdf, el tp de tema polinomios." — same treatment as TP 2 (exercises become cards in the catalog modal).
- S2 Conceptual exercises (ej. 1, 2, 3, 4, 10, 12, 13): decision "Omitirlos" — only 5–9, 11, 14 and 15 are loaded (operations, division, Ruffini, remainder theorem, roots, factored form, finding k).
- S3 Modal organization: decision "Selector de TP arriba" — two top tabs, "TP 2 · Ecuaciones y Factorización" and "TP 3 · Polinomios", each with its own sections; search covers both.
- S4 Every loaded exercise must be verifiable by the card (CAS) like the TP 2 ones; the statement text of exercises that need context (e.g. "sabiendo que 2 es raíz") goes in the card prompt.

## Tasks

- T1 S3 — catalog model with several worksheets (`ws` on items, unique keys, search/onBoard per worksheet) without changing TP 2 behavior — inline — commit: 0edb3bd
- T2 S1 S2 S4 — TP 3 data (ej. 5–9, 11, 14, 15) with CAS-validated answers and tests — inline — commit:
- T3 S3 — modal with the TP selector — inline — commit:
- T4 S1-S4 — README/AGENTS docs and browser check on an isolated instance — inline — commit:

## Log

- L1 (user, verbatim): "/home/admin/Descargas/ente/PRACTICA_3_polinomios.pdf, el tp de tema polinomios."
- L2 (user, answers): conceptual exercises → "Omitirlos (Recomendado)"; organization → "Selector de TP arriba (Recomendado)".
