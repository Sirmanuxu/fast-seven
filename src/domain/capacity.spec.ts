import { describe, expect, it } from 'vitest';
import { computeCapacity } from './capacity';

describe('computeCapacity', () => {
  it('returns every valid team count with balanced rosters', () => {
    expect(computeCapacity(53, { min: 7, max: 12 })).toEqual([
      {
        teamCount: 5,
        rosterSizes: [
          { size: 11, count: 3 },
          { size: 10, count: 2 },
        ],
      },
      {
        teamCount: 6,
        rosterSizes: [
          { size: 9, count: 5 },
          { size: 8, count: 1 },
        ],
      },
      {
        teamCount: 7,
        rosterSizes: [
          { size: 8, count: 4 },
          { size: 7, count: 3 },
        ],
      },
    ]);
  });

  it.each([
    [120, 10, [{ size: 12, count: 10 }]],
    [14, 2, [{ size: 7, count: 2 }]],
    [7, 1, [{ size: 7, count: 1 }]],
  ])('computes the exact roster split for %i players and %i teams', (players, teams, expected) => {
    expect(computeCapacity(players, { min: 7, max: 12 })).toContainEqual({
      teamCount: teams,
      rosterSizes: expected,
    });
  });

  it('returns no options when the players cannot form a valid team count', () => {
    expect(computeCapacity(6, { min: 7, max: 12 })).toEqual([]);
    expect(computeCapacity(13, { min: 7, max: 12 })).toEqual([]);
  });

  it('supports an unlimited maximum roster size', () => {
    expect(computeCapacity(14, { min: 7, max: null })).toEqual([
      { teamCount: 1, rosterSizes: [{ size: 14, count: 1 }] },
      { teamCount: 2, rosterSizes: [{ size: 7, count: 2 }] },
    ]);
  });

  it('rejects invalid counts and roster limits', () => {
    expect(computeCapacity(0, { min: 7, max: 12 })).toEqual([]);
    expect(computeCapacity(14, { min: 0, max: 12 })).toEqual([]);
    expect(computeCapacity(14, { min: 12, max: 7 })).toEqual([]);
  });
});
