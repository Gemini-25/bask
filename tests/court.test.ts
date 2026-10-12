import { describe, expect, it } from 'vitest';
import { CORNER_U, hoopXY, isThreeLocal, toLocal, toWorld } from '../src/sim/court';

describe('코트', () => {
  it('코너 3점 라인은 사이드라인에서 0.9m', () => {
    expect(isThreeLocal(1, 6.7)).toBe(true);
    expect(isThreeLocal(1, 6.4)).toBe(false);
    expect(CORNER_U).toBeCloseTo(2.99, 2);
  });

  it('정면 3점 라인은 골대에서 6.75m', () => {
    expect(isThreeLocal(1.575 + 6.8, 0)).toBe(true);
    expect(isThreeLocal(1.575 + 6.7, 0)).toBe(false);
  });

  it('좌표 변환은 되돌릴 수 있다', () => {
    for (const right of [true, false]) {
      const w = toWorld(right, 5, -2);
      const l = toLocal(right, w.x, w.y);
      expect(l.u).toBeCloseTo(5);
      expect(l.v).toBeCloseTo(-2);
    }
    expect(hoopXY(true).x).toBeCloseTo(28 - 1.575);
    expect(hoopXY(false).x).toBeCloseTo(1.575);
  });
});
