// Shared contracts between the web board, the local server and the agent CLI.

export interface MathItem {
  id: string;
  kind: "math";
  x: number;
  y: number;
  latex: string;
  /** Lines created with Enter share a chain; each step is CAS-checked against the previous one. */
  chain?: string;
  /** Exercise this line belongs to (its chain solves it). */
  exercise?: string;
}

export interface TextItem {
  id: string;
  kind: "text";
  x: number;
  y: number;
  /** Plain text; `$...$` segments render as math. */
  text: string;
  color?: Chalk;
}

export interface PlotMark {
  x: number;
  y?: number;
  label?: string;
}

export interface PlotItem {
  id: string;
  kind: "plot";
  x: number;
  y: number;
  w: number;
  h: number;
  /** LaTeX expressions in x (an equation plots lhs - rhs). */
  exprs: string[];
  xRange: [number, number];
  yRange?: [number, number];
  marks?: PlotMark[];
}

export type Item = MathItem | TextItem | PlotItem;

export type ExerciseKind = "solve" | "factor" | "expand" | "divide";
export type Topic = "lineal" | "cuadratica" | "factorizar" | "operaciones" | "division";

export interface Exercise {
  id: string;
  topic: Topic;
  level: 1 | 2 | 3;
  kind: ExerciseKind;
  prompt: string;
  latex: string;
  /** solve: solution values; factor/expand: expected latex; divide: [quotient, remainder]. */
  answer: string[];
  solved?: boolean;
}

export interface Board {
  version: 1;
  items: Item[];
  exercises: Exercise[];
  selection: string[];
  view: { x: number; y: number; zoom: number };
  updatedAt: string;
}

export type AskMode = "explain" | "tutor" | "check" | "exercise" | "chat";

export interface Ask {
  id: string;
  at: string;
  text: string;
  mode: AskMode;
  /** Item ids the user selected when asking. */
  focus: string[];
}

export interface ChatMessage {
  id: string;
  at: string;
  from: "me" | "profe";
  text: string;
  mode?: AskMode;
  presentationId?: string;
}

// ---------------------------------------------------------------- presentation DSL

export const CHALKS = ["white", "yellow", "blue", "pink", "green", "orange", "red"] as const;
export type Chalk = (typeof CHALKS)[number];

export interface Placement {
  at?: { x: number; y: number };
  below?: string;
  above?: string;
  right?: string;
  left?: string;
  dx?: number;
  dy?: number;
}

export type Action =
  | ({ type: "write"; id: string; latex: string; color?: Chalk; size?: number } & Placement)
  | ({ type: "text"; id: string; text: string; color?: Chalk; size?: number } & Placement)
  | { type: "mark"; target: string; latex: string }
  | { type: "highlight"; target: string; style?: "box" | "circle" | "underline" | "fill"; color?: Chalk; label?: string }
  | { type: "arrow"; from: string; to: string; label?: string; color?: Chalk; bend?: number }
  | { type: "strike"; target: string; color?: Chalk }
  | ({
      type: "plot";
      id: string;
      exprs: string[];
      xRange: [number, number];
      yRange?: [number, number];
      marks?: PlotMark[];
      w?: number;
      h?: number;
    } & Placement)
  | { type: "erase"; target: string }
  | { type: "focus"; target?: string; zoom?: number }
  | { type: "wait"; ms: number }
  | { type: "clear" };

export type ActionType = Action["type"];

export interface Step {
  /** Caption shown under the board. `$...$` renders as math. */
  say: string;
  actions?: Action[];
  /** Wait for the learner to press "next" after this step. */
  pause?: boolean;
}

export interface Presentation {
  id?: string;
  title: string;
  replyTo?: string;
  steps: Step[];
}

export type ServerEvent =
  | { type: "presentation"; presentation: Presentation }
  | { type: "chat"; message: ChatMessage }
  | { type: "presence"; agents: number }
  | { type: "board"; board: Board; source: string };
