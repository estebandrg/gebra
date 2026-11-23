// Freehand strokes: turns raw pointer points into a compact DrawItem geometry and an SVG path.
import type { Chalk, DrawItem } from "./types";

type Pt = [number, number];

/** Ramer–Douglas–Peucker: drops points closer than `tol` to the line between their neighbours. */
export function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts;
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a]!;
    const [bx, by] = pts[b]!;
    const len = Math.hypot(bx - ax, by - ay);
    let far = -1;
    let max = tol;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i]!;
      const d = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (d > max) {
        max = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = true;
      stack.push([a, far], [far, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Builds the item for a finished stroke (world-space points); a single tap becomes a dot. */
export function strokeToItem(points: Pt[], color: Chalk, size: number): Omit<DrawItem, "id"> | null {
  if (!points.length) return null;
  const pts = points.length === 1 ? ([points[0]!, [points[0]![0] + 0.01, points[0]![1]]] as Pt[]) : simplify(points, 0.8);
  const pad = size / 2 + 3;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.round(Math.min(...xs) - pad);
  const y = Math.round(Math.min(...ys) - pad);
  const w = Math.ceil(Math.max(...xs) + pad - x);
  const h = Math.ceil(Math.max(...ys) + pad - y);
  return { kind: "draw", x, y, w, h, color, size, pts: pts.map(([px, py]) => [round(px - x), round(py - y)]) };
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Smooth SVG path through the points (quadratic curves between midpoints). */
export function strokePath(pts: Pt[]): string {
  if (!pts.length) return "";
  const [x0, y0] = pts[0]!;
  if (pts.length === 1) return `M${x0} ${y0}h.01`;
  if (pts.length === 2) return `M${x0} ${y0}L${pts[1]![0]} ${pts[1]![1]}`;
  let d = `M${x0} ${y0}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [cx, cy] = pts[i]!;
    const [nx, ny] = pts[i + 1]!;
    d += `Q${cx} ${cy} ${round((cx + nx) / 2)} ${round((cy + ny) / 2)}`;
  }
  const last = pts.at(-1)!;
  return d + `L${last[0]} ${last[1]}`;
}
