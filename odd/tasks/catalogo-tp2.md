# Feature: catalogo-tp2

Catalog of the exercises of "Trabajo Práctico 2: Ecuaciones y Factorización" (UNRN, Matemática 2) in a modal split into
sections; clicking an exercise puts its card on the board. Branch: `feat/ejercicios-interactivos`.

## Specs

- S1 Catalog modal: "asi te mando unos ejercicios que quiero que incorpores. Lo que si voy a necesitar que en ejercicios dividas el contenido pq van a ser bastantes, suponga algo tipo modal con secciones de tipo de ejercicios."
- S2 Word problems (ej. 2a–2j): decision "Omitirlos por ahora" — only exercises with a mathematical expression are loaded.
- S3 CAS fixes in scope: decision "Sí, ambos" — adjacent letters such as `35xb` must parse as a product (not one variable `xb`), and a card must accept "sin solución" / "infinitas soluciones" as a final answer (PDF 1c is an identity, 1d has no solution: "Observar que pueden tener una solución, ninguna, ó infinitas").
- S4 Sections: decision "Agrupadas en 6" — Ecuaciones · Productos notables (3–4) · Factorización (5–9, 12) · Cuadráticas (11, 13) · Simplificar (10, 14); the sixth, Problemas, is empty because of S2.

## Tasks

- T1 S3 — implicit multiplication of adjacent letters in the CAS (`35xb`, `2wx`) — inline — commit: 011fa19
- T2 S3 — "sin solución" / "infinitas" as exercise answers (check, expected-answer text, server create) — inline — commit:
- T3 S1 S2 S4 — catalog data (`src/shared/catalog.ts`) with CAS-validated answers and a test over every entry — inline — commit:
- T4 S1 S4 — modal with section tabs, opens from the toolbar and a shortcut, click adds the card — inline — commit:
- T5 S1-S4 — README/AGENTS/help docs, browser check — inline — commit:

## Log

- L1 (user, verbatim): "Tenes el poder de ver un PDF, asi te mando unos ejercicios que quiero que incorpores. Lo que si voy a necesitar que en ejercicios dividas el contenido pq van a ser bastantes, suponga algo tipo modal con secciones de tipo de ejercicios./home/admin/Descargas/ente/PRACTICA_2_ecuaciones y factorizacion.pdf"
- L2 (user, answers): problems → "Omitirlos por ahora"; CAS → "Sí, ambos (Recomendado)"; sections → "Agrupadas en 6 (Recomendado)".
