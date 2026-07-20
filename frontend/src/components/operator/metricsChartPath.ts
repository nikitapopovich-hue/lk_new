export type ChartPoint = { x: number; y: number };

/** Плавная кривая Catmull–Rom → cubic Bezier через все точки. */
export function smoothCurvePath(points: ChartPoint[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const parts: string[] = [`M ${points[0].x} ${points[0].y}`];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    parts.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`);
  }

  return parts.join(" ");
}

export function smoothAreaPath(points: ChartPoint[], baselineY: number): string {
  if (points.length === 0) return "";
  const curve = smoothCurvePath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${curve} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
}
