// Validation for presentation scripts sent by the agent. Errors are Spanish, one line each,
// prefixed with the JSON path so the agent can fix them quickly.
import katex from "katex";
import { CHALKS } from "./types";

const ACTION_TYPES = ["write", "text", "mark", "highlight", "arrow", "strike", "plot", "erase", "focus", "wait", "clear"];
const HIGHLIGHT_STYLES = ["box", "circle", "underline", "fill"];

export function latexError(latex: string, displayMode = true): string | null {
  try {
    katex.renderToString(latex, { throwOnError: true, displayMode, trust: true, strict: "ignore" });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message.replace(/^KaTeX parse error: /, "") : String(e);
  }
}

/** Math segments inside `$...$` of a caption or note. */
export function inlineMathSegments(text: string): string[] {
  const out: string[] = [];
  const re = /\$([^$]+)\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1]!);
  if ((text.match(/\$/g)?.length ?? 0) % 2 === 1) out.push(text.slice(text.lastIndexOf("$") + 1));
  return out;
}

function textErrors(text: string): string | null {
  for (const seg of inlineMathSegments(text)) {
    const err = latexError(seg, false);
    if (err) return `LaTeX inválido en "$${seg}$": ${err}`;
  }
  return null;
}

/** Ids defined with \htmlId{name}{...} inside a LaTeX string. */
export function partIds(latex: string): string[] {
  return [...latex.matchAll(/\\htmlId\{([^}]+)\}/g)].map((m) => m[1]!);
}

export function validatePresentation(input: unknown, boardIds: string[]): string[] {
  const errors: string[] = [];
  const p = input as Record<string, any>;
  if (!p || typeof p !== "object") return ["la presentación debe ser un objeto JSON"];
  if (typeof p.title !== "string" || !p.title.trim()) errors.push("title es obligatorio");
  if (!Array.isArray(p.steps) || p.steps.length === 0) {
    errors.push("steps debe tener al menos un paso");
    return errors;
  }

  const ids = new Set(boardIds);
  const parts = new Set<string>();
  const knownTarget = (t: unknown) => {
    if (typeof t !== "string" || !t) return false;
    const [base, part] = t.split("#");
    if (!ids.has(base!)) return false;
    return part === undefined || parts.has(`${base}#${part}`);
  };

  p.steps.forEach((step: any, si: number) => {
    const where = `steps[${si}]`;
    if (!step || typeof step.say !== "string") {
      errors.push(`${where}.say es obligatorio`);
      return;
    }
    const sayErr = textErrors(step.say);
    if (sayErr) errors.push(`${where}.say: ${sayErr}`);
    if (step.actions !== undefined && !Array.isArray(step.actions)) {
      errors.push(`${where}.actions debe ser una lista`);
      return;
    }
    (step.actions ?? []).forEach((a: any, ai: number) => {
      const at = `${where}.actions[${ai}]`;
      const err = (msg: string) => errors.push(`${at}: ${msg}`);
      if (!a || !ACTION_TYPES.includes(a.type)) return err(`tipo de acción desconocido "${a?.type}"`);
      if (a.color !== undefined && !(CHALKS as readonly string[]).includes(a.color)) err(`color inválido "${a.color}"`);

      for (const key of ["below", "above", "right", "left"])
        if (a[key] !== undefined && !knownTarget(a[key])) err(`${key} apunta a un id desconocido "${a[key]}"`);
      for (const key of ["target", "from", "to"])
        if (a[key] !== undefined && !knownTarget(a[key])) err(`${key === "target" ? "target" : key} desconocido "${a[key]}"`);

      const defines = (id: unknown) => {
        if (typeof id !== "string" || !/^[\w-]+$/.test(id)) return err(`id inválido "${id}" (usar letras, números, - o _)`);
        if (ids.has(id)) return err(`id duplicado "${id}"`);
        ids.add(id);
      };

      switch (a.type) {
        case "write": {
          if (typeof a.latex !== "string") return err("write necesita latex");
          const le = latexError(a.latex);
          if (le) err(`LaTeX inválido: ${le}`);
          defines(a.id);
          for (const part of partIds(a.latex)) parts.add(`${a.id}#${part}`);
          break;
        }
        case "text": {
          if (typeof a.text !== "string") return err("text necesita text");
          const te = textErrors(a.text);
          if (te) err(te);
          defines(a.id);
          break;
        }
        case "mark": {
          if (typeof a.latex !== "string") return err("mark necesita latex");
          const le = latexError(a.latex);
          if (le) err(`LaTeX inválido: ${le}`);
          const base = String(a.target).split("#")[0];
          for (const part of partIds(a.latex)) parts.add(`${base}#${part}`);
          break;
        }
        case "highlight":
          if (a.style !== undefined && !HIGHLIGHT_STYLES.includes(a.style)) err(`style inválido "${a.style}"`);
          if (a.label !== undefined) {
            const te = textErrors(String(a.label));
            if (te) err(te);
          }
          break;
        case "arrow":
          if (a.label !== undefined) {
            const te = textErrors(String(a.label));
            if (te) err(te);
          }
          break;
        case "plot":
          if (!Array.isArray(a.exprs) || a.exprs.length === 0) err("plot necesita exprs");
          if (!Array.isArray(a.xRange) || a.xRange.length !== 2 || !(a.xRange[0] < a.xRange[1])) err("plot necesita xRange [min, max]");
          defines(a.id);
          break;
        case "wait":
          if (typeof a.ms !== "number" || a.ms < 0) err("wait necesita ms >= 0");
          break;
      }
    });
  });
  return errors;
}
