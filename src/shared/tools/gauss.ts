// gauss tool: pure logic (validation, next step, summary). The web widget lives in src/web/tools/gauss.ts.

/** One-line description of the tool state for `gebra board` (the agent reads it). */
export function summarize(data: Record<string, unknown>): string {
  return JSON.stringify(data);
}
