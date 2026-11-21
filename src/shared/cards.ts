// Exercise cards: the learner's lines inside a card and their CAS verdicts, shared by the web and the CLI.
import { compareSteps, type StepCheck } from "./cas";
import { checkExerciseStep } from "./exercises";
import type { Board, CardItem, Exercise, MathItem } from "./types";

export interface CardLineProgress {
  id: string;
  latex: string;
  /** Verdict against the previous line (or the statement for the first one); null when not comparable. */
  check: StepCheck | null;
}

export interface CardProgress {
  exercise: Exercise | undefined;
  lines: CardLineProgress[];
  status: "empty" | "solved" | "progress" | "wrong" | "unknown";
  reason: string;
}

/** Work lines of a card, in board order (that order is the step order). */
export function cardLines(board: Board, cardId: string): MathItem[] {
  return board.items.filter((i): i is MathItem => i.kind === "math" && i.card === cardId);
}

export function cardProgress(board: Board, card: CardItem, compare: (a: string, b: string) => StepCheck = compareSteps): CardProgress {
  const exercise = board.exercises.find((e) => e.id === card.exercise);
  const lines = cardLines(board, card.id).filter((l) => l.latex.trim());
  const out: CardLineProgress[] = lines.map((l, i) => {
    const prev = i > 0 ? lines[i - 1]!.latex : exercise && exercise.kind !== "divide" ? exercise.latex : null;
    return { id: l.id, latex: l.latex, check: prev === null ? null : compare(prev, l.latex) };
  });
  const last = lines.at(-1);
  if (!exercise || !last) return { exercise, lines: out, status: "empty", reason: "" };
  const p = checkExerciseStep(exercise, last.latex);
  return { exercise, lines: out, status: p.status, reason: p.reason };
}
