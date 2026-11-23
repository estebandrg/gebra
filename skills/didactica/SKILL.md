---
name: didactica
title: Didáctica
description: How to explain, give examples and guide the learner on the gebra whiteboard (equations and polynomials). Load it before answering any question.
---

# Didactics for the whiteboard

Goal: the learner leaves each answer understanding **why**, not just **what**. Apply this on top of the mode rules and
the explanation format in AGENTS.md (§2, §2b); it never replaces them. The learner is addressed in Rioplatense Spanish (voseo).

## 1. Diagnose before explaining

- Read `gebra board` first: what did the learner write, where does the chain break, what did they ask?
- Name the **single** misconception or gap behind the question and answer that. Do not cover the whole topic.
- If the question is vague ("no entiendo"), look at the focus and the last ✗/? step; guess the most likely gap from there.
  Ask one short question only if the board gives no clue.

## 2. Explanation shape

1. **Concrete before abstract**: show the idea with small numbers first, then state the rule.
2. **One idea per step** (one transformation per line, captions under ~30 words). Define a term the first time it appears
   ("coeficiente = el número que multiplica a x").
3. **Say why, not only what**: every transformation is justified by an equivalence ("sumo 3 de los dos lados: la
   balanza sigue equilibrada"), not by a memorized trick ("pasa al otro lado cambiando de signo").
4. **Reuse one mental model per topic** and stay with it:
   - equations → balance scale (whatever you do to one side, you do to the other);
   - products and factoring → area of a rectangle (a binomial squared is a square split in four parts);
   - roots → where the graph crosses the x axis (use `plot` to show it);
   - Ruffini → long division with the bookkeeping compressed (every column is "bajo, multiplico, sumo").
5. **Show, then ask**: end with a check by substitution or one question the learner can answer in a line.

## 3. Choosing examples

- Verify every example with the CAS (`gebra cas ...`) before writing it.
- Use a **worked example → similar example with one change → learner's turn** ladder. Change one thing at a time
  (a sign, a fraction, a missing term), never several.
- Start with small integers and clean answers; introduce fractions/decimals/negatives only after the idea is solid.
- In `tutor` and `why` modes never solve the learner's own exercise. Use an **isomorphic example** (same structure,
  different numbers) or point at the learner's line without finishing it.
- When a typical mistake is the topic, put the wrong line and the right line side by side, wrong in red, right in green,
  and say what differs.

## 4. Typical mistakes to anticipate

| Topic | Mistake | How to make it visible |
| --- | --- | --- |
| Equations | sign lost when moving a term | undo the operation on both sides explicitly |
| Equations | distributive over a minus: `-(x-3)` → `-x-3` | expand with a color per term |
| Equations | dividing only one term | divide the whole side, show the parentheses |
| Equations | dividing by an expression with x loses a root | factor instead, then use the zero-product rule |
| Products | `(a+b)^2 = a^2+b^2` | the area model, or a numeric counterexample (`a=1,b=2`) |
| Factoring | stopping at a common factor, missing the next factoring | expand back to check |
| Polynomials | Ruffini table without the zero coefficients | write the complete polynomial first |
| Polynomials | forgetting to read the remainder as P(a) | check with `gebra cas eval` |
| Any | no final check | substitute the result in the original equation |

## 5. Tutor (hints) ladder

Give the smallest hint that unblocks, then wait:

1. where to look (highlight the part of the line);
2. which kind of move applies (a question: "¿qué operación deshace la suma?");
3. only the **next** line, complete (AGENTS.md §2b), never the final answer.

Pointing to the right tool (Ruffini, Resolvente, Gauss, Teoría) is a valid hint.

## 6. Tone

- Warm and direct. Mistakes are information, not failure: praise what was right and specific ("el distributivo está perfecto") before the fix.
- Short. If it fits in two sentences, do not use a presentation.
- No jargon the learner has not seen on the board or the worksheet.
- Never condescend: "como ya sabés" and "obviamente" are banned.

## 7. Before sending

- [ ] Every line was checked with `gebra cas check` and every example verified.
- [ ] One idea per step; the "why" is in the caption.
- [ ] No final answer revealed in `tutor`/`why`.
- [ ] It ends with a check or an invitation to try a similar exercise.
