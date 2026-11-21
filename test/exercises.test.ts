import { describe, expect, test } from "bun:test";
import { generateExercise, checkExerciseStep, exerciseAnswerTeX } from "../src/shared/exercises";
import { compareSteps, parseMath, solveEquation } from "../src/shared/cas";
import type { Exercise, Topic } from "../src/shared/types";

const topics: Topic[] = ["lineal", "cuadratica", "factorizar", "operaciones", "division"];

describe("generateExercise", () => {
  test("is deterministic for a seed", () => {
    expect(generateExercise("lineal", 2, 42)).toEqual(generateExercise("lineal", 2, 42));
  });

  for (const topic of topics)
    for (const level of [1, 2, 3] as const)
      test(`${topic} nivel ${level} has a consistent answer`, () => {
        for (let seed = 1; seed <= 15; seed++) {
          const ex = generateExercise(topic, level, seed);
          expect(parseMath(ex.latex).kind).not.toBe("invalid");
          if (ex.kind === "solve") {
            const s = solveEquation(ex.latex);
            expect(s.solutions.length).toBe(ex.answer.length);
            expect(checkExerciseStep(ex, ex.answer.map((v) => `x=${v}`).join(",\\ ")).status).toBe("solved");
          } else if (ex.kind === "divide") {
            const [dividend, divisor] = ex.latex.split("\\div").map((s) => s.replace(/\\left\(|\\right\)/g, ""));
            const [q, r] = ex.answer;
            expect(compareSteps(`(${divisor})(${q})+(${r})`, dividend!).status).toBe("equivalent");
          } else {
            expect(compareSteps(ex.latex, ex.answer[0]!).status).toBe("equivalent");
            expect(checkExerciseStep(ex, ex.answer[0]!).status).toBe("solved");
          }
        }
      });
});

describe("checkExerciseStep", () => {
  test("solve: intermediate equivalent step is progress, wrong step is wrong", () => {
    const ex = { id: "e", topic: "lineal", level: 1, kind: "solve", prompt: "", latex: "2x+3=7", answer: ["2"] } satisfies Exercise;
    expect(checkExerciseStep(ex, "2x=4").status).toBe("progress");
    expect(checkExerciseStep(ex, "x=2").status).toBe("solved");
    expect(checkExerciseStep(ex, "x=5").status).toBe("wrong");
  });

  test("factor: expanded form is not solved yet", () => {
    const ex = { id: "e", topic: "factorizar", level: 1, kind: "factor", prompt: "", latex: "x^2-5x+6", answer: ["(x-2)(x-3)"] } satisfies Exercise;
    expect(checkExerciseStep(ex, "x^2-2x-3x+6").status).toBe("progress");
    expect(checkExerciseStep(ex, "(x-3)(x-2)").status).toBe("solved");
    expect(checkExerciseStep(ex, "(x-1)(x-6)").status).toBe("wrong");
  });

  test("expand: factored form is not solved yet", () => {
    const ex = { id: "e", topic: "operaciones", level: 1, kind: "expand", prompt: "", latex: "(x+1)(x+2)", answer: ["x^2+3x+2"] } satisfies Exercise;
    expect(checkExerciseStep(ex, "x^2+2x+x+2").status).toBe("progress");
    expect(checkExerciseStep(ex, "x^2+3x+2").status).toBe("solved");
  });
});

describe("exercises without a single solution", () => {
  const none: Exercise = { id: "n", topic: "lineal", level: 1, kind: "solve", prompt: "Resolvé", latex: "-2\\left(0.2x-0.6\\right)\\left(-0.5\\right)-1=\\frac{x-3}{5}", answer: ["none"] };
  const all: Exercise = { id: "a", topic: "lineal", level: 1, kind: "solve", prompt: "Resolvé", latex: "4x-7=\\frac{0.5x-\\frac{7}{8}}{0.125}", answer: ["all"] };
  test("no solution: a false numeric line or the words solve it", () => {
    for (const line of ["0=5", "-1.6=-0.6", "\\text{sin solución}", "S=\\varnothing", "\\emptyset"]) expect(checkExerciseStep(none, line).status).toBe("solved");
    expect(checkExerciseStep(none, "0.2x-1.6=0.2x-0.6").status).toBe("progress");
    expect(checkExerciseStep(none, "x=3").status).toBe("wrong");
  });
  test("infinite solutions: a true numeric line or the words solve it", () => {
    for (const line of ["0=0", "-7=-7", "\\text{infinitas soluciones}", "S=\\mathbb{R}", "x=x", "4x-7=4x-7"]) expect(checkExerciseStep(all, line).status).toBe("solved");
    expect(checkExerciseStep(all, "4x-7=\\frac{0.5x-0.875}{0.125}").status).toBe("progress");
    expect(checkExerciseStep(all, "0=5").status).toBe("wrong");
  });
  test("the expected answer reads as words", () => {
    expect(exerciseAnswerTeX(none)).toBe("\\text{sin solución}");
    expect(exerciseAnswerTeX(all)).toBe("\\text{infinitas soluciones}");
  });
});
