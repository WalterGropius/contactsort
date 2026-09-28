import { describe, expect, it } from 'vitest';
import { sliceAt, sliceCenter } from './wheel';

describe('wheel', () => {
  it('puts two lists left and right', () => {
    expect(sliceAt(180, 2)).toBe(0);
    expect(sliceAt(0, 2)).toBe(1);
    expect(sliceAt(-30, 2)).toBe(1);
  });

  it('starts at the top and goes clockwise for other counts', () => {
    expect(sliceAt(-90, 4)).toBe(0); // up
    expect(sliceAt(0, 4)).toBe(1); // right
    expect(sliceAt(90, 4)).toBe(2); // down
    expect(sliceAt(180, 4)).toBe(3); // left
    expect(sliceAt(-46, 4)).toBe(0);
    expect(sliceAt(-134 + 360, 4)).toBe(0);
    expect(sliceAt(-44, 4)).toBe(1);
  });

  it('maps every slice centre back to its own slice', () => {
    for (let n = 1; n <= 12; n++) for (let i = 0; i < n; i++) expect(sliceAt(sliceCenter(i, n), n)).toBe(i);
  });
});
