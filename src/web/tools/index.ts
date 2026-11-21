// Wires every learning tool into the board (card actions, tool renderers, panels).
import type { BoardView } from "../board";
import * as catalog from "./catalog";
import * as gauss from "./gauss";
import * as resolvente from "./resolvente";
import * as ruffini from "./ruffini";
import * as theory from "./theory";

export function registerTools(board: BoardView) {
  for (const t of [ruffini, resolvente, gauss, theory, catalog]) t.register(board);
}
