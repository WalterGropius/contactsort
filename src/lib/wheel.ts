// Geometry of the drop wheel: N equal slices around the card stack.
// Screen angles in degrees: 0 = right, 90 = down (clockwise).

/** Two lists sit left/right like classic swiping; otherwise slice 1 points up. */
export function wheelOffset(n: number): number {
  return n === 2 ? 180 : -90;
}

export function sliceCenter(i: number, n: number): number {
  return wheelOffset(n) + (i * 360) / n;
}

export function sliceAt(angle: number, n: number): number {
  if (n <= 1) return 0;
  const step = 360 / n;
  const a = (((angle - wheelOffset(n) + step / 2) % 360) + 360) % 360;
  return Math.min(n - 1, Math.floor(a / step));
}

export const rad = (deg: number) => (deg * Math.PI) / 180;

export interface Point {
  x: number;
  y: number;
}

/** SVG path for slice i of n, centred on c with radius r. */
export function slicePath(i: number, n: number, c: Point, r: number): string {
  if (n <= 1) return `M ${c.x - r} ${c.y} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
  const step = 360 / n;
  const a0 = rad(sliceCenter(i, n) - step / 2);
  const a1 = rad(sliceCenter(i, n) + step / 2);
  const large = step > 180 ? 1 : 0;
  return [
    `M ${c.x} ${c.y}`,
    `L ${c.x + r * Math.cos(a0)} ${c.y + r * Math.sin(a0)}`,
    `A ${r} ${r} 0 ${large} 1 ${c.x + r * Math.cos(a1)} ${c.y + r * Math.sin(a1)}`,
    'Z',
  ].join(' ');
}

export interface LabelBox {
  w: number;
  h: number;
}

/** Rough pill size for a list label (name + key badge). */
export function labelBox(name: string): LabelBox {
  return { w: Math.min(220, 58 + name.length * 8.4), h: 40 };
}

/**
 * Where a slice's label goes: just outside the card in the slice's direction,
 * clamped inside the viewport.
 */
export function labelPosition(
  angle: number,
  center: Point,
  half: { w: number; h: number },
  box: LabelBox,
  viewport: { w: number; h: number },
): Point {
  const cos = Math.cos(rad(angle));
  const sin = Math.sin(rad(angle));
  const toEdge = Math.min(half.w / Math.max(Math.abs(cos), 1e-6), half.h / Math.max(Math.abs(sin), 1e-6));
  const extent = (box.w / 2) * Math.abs(cos) + (box.h / 2) * Math.abs(sin);
  const r = toEdge + 22 + extent;
  const m = 12;
  return {
    x: Math.min(viewport.w - box.w / 2 - m, Math.max(box.w / 2 + m, center.x + cos * r)),
    y: Math.min(viewport.h - box.h / 2 - m, Math.max(box.h / 2 + m, center.y + sin * r)),
  };
}
