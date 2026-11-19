import { describe, expect, it } from 'vitest';
import { createSeededRng } from './rng';

describe('createSeededRng', () => {
  it('returns the same sequence for the same seed', () => {
    const first = createSeededRng('draw-1');
    const second = createSeededRng('draw-1');

    expect([first.next(), first.next(), first.nextInt(10)]).toEqual([
      second.next(),
      second.next(),
      second.nextInt(10),
    ]);
  });

  it('shuffles a copy without mutating the input', () => {
    const rng = createSeededRng('groups');
    const input = [1, 2, 3, 4] as const;

    const result = rng.shuffle(input);

    expect(input).toEqual([1, 2, 3, 4]);
    expect(result).not.toBe(input);
    expect([...result].sort()).toEqual([1, 2, 3, 4]);
  });

  it('rejects an invalid nextInt limit', () => {
    const rng = createSeededRng('limit');

    expect(() => rng.nextInt(0)).toThrow(RangeError);
  });
});
