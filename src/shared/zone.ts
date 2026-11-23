// "Señalar": works out what is inside a zone the learner pointed at from the real board and presentation state
// (exact LaTeX, CAS verdicts, colors, the assistant's highlights, the geometry of hand drawings), so the agent
// reads facts instead of guessing from a picture.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Pt = [number, number];

export interface SceneElement {
  id: string;
  source: "pizarra" | "presentación";
  kind: "math" | "text" | "plot" | "draw" | "card" | "tool";
  rect: Rect;
  color?: string;
  latex?: string;
  text?: string;
  exprs?: string[];
  /** Card statement or tool state. */
  detail?: string;
  /** CAS verdict of a work line against the previous step. */
  verdict?: string;
  /** Hand drawing in world coordinates. */
  stroke?: { pts: Pt[]; size: number };
}

/** A highlight, arrow or strike the assistant's presentation drew over elements. */
export interface SceneNote {
  type: "highlight" | "arrow" | "strike";
  target?: string;
  from?: string;
  to?: string;
  style?: string;
  color?: string;
  label?: string;
}

export interface Scene {
  elements: SceneElement[];
  notes: SceneNote[];
  presentation?: { title: string; step: number; total: number; caption: string };
}

export interface Zone {
  /** Ids of the board items inside the zone (presentation elements are not board items). */
  ids: string[];
  count: number;
  /** Multi-line report for the agent. */
  detail: string;
}

export const KIND: Record<SceneElement["kind"], string> = {
  math: "ecuación",
  text: "nota",
  plot: "gráfica",
  draw: "dibujo a mano",
  card: "tarjeta de ejercicio",
  tool: "herramienta",
};
const COLOR: Record<string, string> = { white: "blanco", yellow: "amarillo", blue: "azul", pink: "rosa", green: "verde", orange: "naranja", red: "rojo" };
const STYLE: Record<string, string> = { box: "caja", circle: "círculo", underline: "subrayado", fill: "relleno" };
export const colorName = (c?: string) => (c ? (COLOR[c] ?? c) : "");

export function intersectionArea(a: Rect, b: Rect): number {
  return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
}

/** An element belongs to a zone when its center is inside it or at least half of it overlaps. */
export function inZone(zone: Rect, r: Rect): "completo" | "parcial" | null {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const center = cx >= zone.x && cx <= zone.x + zone.w && cy >= zone.y && cy <= zone.y + zone.h;
  const area = Math.max(1, r.w * r.h);
  const ratio = intersectionArea(zone, r) / area;
  if (!center && ratio < 0.5) return null;
  return ratio >= 0.95 ? "completo" : "parcial";
}

// ------------------------------------------------------------ hand drawings

export interface StrokeShape {
  kind: "punto" | "recta" | "curva" | "cerrada";
  /** Human description, e.g. "línea recta horizontal de 140 px". */
  label: string;
  length: number;
  bbox: Rect;
  /** Straight stroke direction: horizontal, vertical or diagonal. */
  dir?: "horizontal" | "vertical" | "diagonal";
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function describeStroke(pts: Pt[]): StrokeShape {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const bbox = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  let length = 0;
  for (let i = 1; i < pts.length; i++) length += dist(pts[i - 1]!, pts[i]!);
  const first = pts[0]!;
  const last = pts.at(-1)!;
  const chord = dist(first, last);
  const px = (n: number) => `${Math.round(n)} px`;
  if (length < 8) return { kind: "punto", label: "punto o marca pequeña", length, bbox };
  if (length > 30 && chord < 0.25 * length) {
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i]!;
      const [x2, y2] = pts[(i + 1) % pts.length]!;
      area += x1 * y2 - x2 * y1;
    }
    area = Math.abs(area) / 2;
    const circularity = (4 * Math.PI * area) / (length * length);
    const fill = area / Math.max(1, bbox.w * bbox.h);
    const what = circularity > 0.72 ? (Math.abs(bbox.w - bbox.h) < 0.25 * Math.max(bbox.w, bbox.h) ? "círculo" : "óvalo") : fill > 0.82 ? "rectángulo" : "forma cerrada irregular";
    return { kind: "cerrada", label: `${what} de ${px(bbox.w)} × ${px(bbox.h)}`, length, bbox };
  }
  if (chord / length > 0.9) {
    const dx = last[0] - first[0];
    const dy = last[1] - first[1];
    const angle = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
    const dir = angle < 18 ? "horizontal" : angle > 72 ? "vertical" : "diagonal";
    const up = (dx > 0 && dy < 0) || (dx < 0 && dy > 0);
    return { kind: "recta", dir, label: `línea recta ${dir}${dir === "diagonal" ? (up ? " ascendente ↗" : " descendente ↘") : ""} de ${px(chord)}`, length, bbox };
  }
  return { kind: "curva", label: `trazo curvo de ${px(bbox.w)} × ${px(bbox.h)}`, length, bbox };
}

/** What a hand-drawn stroke does to the elements around it: underlines, strikes them out, or encloses them. */
export function strokeRelations(shape: StrokeShape, targets: SceneElement[]): string[] {
  const out: string[] = [];
  const b = shape.bbox;
  const under: string[] = [];
  const strike: string[] = [];
  const enclose: string[] = [];
  for (const t of targets) {
    const r = t.rect;
    const overlapX = Math.max(0, Math.min(b.x + b.w, r.x + r.w) - Math.max(b.x, r.x));
    const midY = b.y + b.h / 2;
    if (shape.kind === "recta" && shape.dir !== "vertical") {
      if (overlapX / Math.max(1, r.w) >= 0.5 && midY >= r.y + r.h * 0.85 && midY <= r.y + r.h + 28 && shape.dir === "horizontal") under.push(t.id);
      else if (overlapX / Math.max(1, r.w) >= 0.6 && midY > r.y + r.h * 0.15 && midY < r.y + r.h * 0.85) strike.push(t.id);
    }
    if (shape.kind === "cerrada" && b.x <= r.x + 6 && b.y <= r.y + 6 && b.x + b.w >= r.x + r.w - 6 && b.y + b.h >= r.y + r.h - 6 && !(r.w >= b.w && r.h >= b.h)) enclose.push(t.id);
  }
  const list = (ids: string[]) => ids.map((i) => `[${i}]`).join(", ");
  if (under.length) out.push(`subraya ${list(under)}`);
  if (strike.length) out.push(`tacha ${list(strike)}`);
  if (enclose.length) out.push(`encierra ${list(enclose)}`);
  return out;
}

// ------------------------------------------------------------ the report

const baseId = (t?: string) => t?.split("#")[0];

export function notesFor(id: string, notes: SceneNote[]): string[] {
  const out: string[] = [];
  for (const n of notes) {
    const tag = n.label ? ` «${n.label}»` : "";
    if (n.type === "highlight" && baseId(n.target) === id) {
      const part = n.target?.includes("#") ? ` (parte «${n.target.split("#")[1]}»)` : "";
      out.push(`el asistente lo resaltó${part} con ${STYLE[n.style ?? "box"] ?? n.style} ${colorName(n.color)}${tag}`.replace(/\s+/g, " ").trim());
    } else if (n.type === "strike" && baseId(n.target) === id) out.push(`el asistente lo tachó en ${colorName(n.color) || "rojo"}`);
    else if (n.type === "arrow") {
      if (baseId(n.from) === id) out.push(`flecha del asistente hacia [${baseId(n.to)}]${tag}`);
      if (baseId(n.to) === id) out.push(`flecha del asistente desde [${baseId(n.from)}]${tag}`);
    }
  }
  return out;
}

function describeElement(e: SceneElement, coverage: string, scene: Scene, targets: SceneElement[]): string {
  const head = `[${e.id}] (${e.source}) ${KIND[e.kind]}${e.color && e.kind !== "math" ? ` ${colorName(e.color)}` : e.color ? ` ${colorName(e.color)}` : ""}`;
  const parts: string[] = [];
  if (e.kind === "math") parts.push(e.latex?.trim() ? `$${e.latex}$` : "(vacía)");
  else if (e.kind === "text") parts.push(`"${(e.text ?? "").replace(/\s+/g, " ")}"`);
  else if (e.kind === "plot") parts.push((e.exprs ?? []).map((x) => `$${x}$`).join(", ") + (e.detail ? ` · ${e.detail}` : ""));
  else if (e.kind === "draw" && e.stroke) {
    const shape = describeStroke(e.stroke.pts);
    parts.push(shape.label);
    const rel = strokeRelations(shape, targets.filter((t) => t.id !== e.id && t.kind !== "draw"));
    if (rel.length) parts.push(rel.join("; "));
  } else if (e.detail) parts.push(e.detail);
  if (e.verdict) parts.push(e.verdict);
  parts.push(...notesFor(e.id, scene.notes));
  if (coverage === "parcial") parts.push("parcialmente dentro de la zona");
  return `${head}: ${parts.join(" — ")}`;
}

/** Everything the scene holds inside `region`, as a report for the agent. */
export function describeZone(region: Rect, scene: Scene): Zone {
  const inside = scene.elements
    .map((e) => ({ e, coverage: inZone(region, e.rect) }))
    .filter((x): x is { e: SceneElement; coverage: "completo" | "parcial" } => x.coverage !== null)
    .sort((a, b) => a.e.rect.y - b.e.rect.y || a.e.rect.x - b.e.rect.x);
  const near = scene.elements.filter((e) => intersectionArea({ x: region.x - 40, y: region.y - 40, w: region.w + 80, h: region.h + 80 }, e.rect) > 0);
  const board = inside.filter((x) => x.e.source === "pizarra");
  const pres = inside.filter((x) => x.e.source === "presentación");
  const where = `x ${Math.round(region.x)}–${Math.round(region.x + region.w)}, y ${Math.round(region.y)}–${Math.round(region.y + region.h)}`;
  const lines: string[] = [];
  if (!inside.length) lines.push(`Zona (${where}) sin elementos: espacio vacío de la pizarra.`);
  else {
    const mix = [board.length ? `${board.length} de la pizarra` : "", pres.length ? `${pres.length} de la presentación del asistente` : ""].filter(Boolean).join(", ");
    lines.push(`Zona (${where}): ${inside.length} elemento${inside.length === 1 ? "" : "s"} (${mix}), de arriba hacia abajo.`);
  }
  if (pres.length && scene.presentation) {
    const p = scene.presentation;
    lines.push(`Presentación «${p.title}», paso ${p.step}/${p.total}; explicación de ese paso: "${p.caption.replace(/\s+/g, " ")}"`);
  }
  inside.forEach(({ e, coverage }, i) => lines.push(`${i + 1}. ${describeElement(e, coverage, scene, near)}`));
  return { ids: board.map((x) => x.e.id), count: inside.length, detail: lines.join("\n") };
}
