// 코드로 찍는 도트 그래픽 (G8). 캔버스에 1px 단위로 그린다.

/** 3×5 숫자 도트 폰트 */
const DIGITS: Record<string, string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
};

export function drawDigits(ctx: CanvasRenderingContext2D, text: string, cx: number, top: number, color: string) {
  const w = text.length * 4 - 1;
  let x = Math.round(cx - w / 2);
  ctx.fillStyle = color;
  for (const ch of text) {
    const g = DIGITS[ch];
    if (g) g.forEach((row, ry) => [...row].forEach((c, rx) => c === '#' && ctx.fillRect(x + rx, top + ry, 1, 1)));
    x += 4;
  }
}

/** 채워진 도트 원 */
export function fillCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y + r * 0.8));
    ctx.fillRect(cx - half, cy + y, half * 2 + 1, 1);
  }
}

/** 도트 원 테두리 (각도를 촘촘히 찍는다) */
export function strokeArc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, a0: number, a1: number, color: string) {
  ctx.fillStyle = color;
  const steps = Math.ceil(Math.abs(a1 - a0) * r * 2);
  let lx = NaN;
  let ly = NaN;
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const x = Math.round(cx + Math.cos(a) * r);
    const y = Math.round(cy + Math.sin(a) * r);
    if (x !== lx || y !== ly) ctx.fillRect(x, y, 1, 1);
    lx = x;
    ly = y;
  }
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function shade(hex: string, f: number): string {
  const [r, g, b] = hexToRgb(hex);
  const m = (v: number) => Math.round(Math.max(0, Math.min(255, f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function colorDistance(a: string, b: string): number {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

export function numberColorFor(fill: string): string {
  return luminance(fill) > 0.6 ? '#1b1f2a' : '#ffffff';
}
