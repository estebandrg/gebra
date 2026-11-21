// Registry of tool summaries for the CLI board view.
import type { ToolItem, ToolKind } from "../types";
import * as gauss from "./gauss";
import * as resolvente from "./resolvente";
import * as ruffini from "./ruffini";

const TOOLS: Record<ToolKind, { summarize: (data: Record<string, unknown>) => string }> = { ruffini, resolvente, gauss };

export const TOOL_LABEL: Record<ToolKind, string> = { ruffini: "Ruffini", resolvente: "Resolvente", gauss: "Gauss" };

export function toolSummary(item: ToolItem): string {
  return TOOLS[item.tool]?.summarize(item.data) ?? "";
}
