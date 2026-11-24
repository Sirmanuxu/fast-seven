import { describe, expect, it } from 'vitest';
import { createGroupDrawPlan, groupsFromPlan, moveTeamBetweenGroups } from './group-draw';
import { createSeededRng } from './rng';
import { Team } from './model';

const teams = (count: number, seeded: number): Team[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `team-${index + 1}`,
    name: `Team ${index + 1}`,
    primaryColor: '#000000',
    secondaryColor: '#ffffff',
    captainId: null,
    logo: null,
    isSeed: index < seeded,
    status: 'ACTIVE' as const,
  }));

describe('createGroupDrawPlan', () => {
  it('distributes one seed per group and then by rounds', () => {
    const result = createGroupDrawPlan({
      teams: teams(11, 5),
      groupCount: 3,
      drawId: 'draw-1',
      seed: 'seed-1',
      createdAt: '2026-11-24T00:00:00.000Z',
      rng: createSeededRng('seed-1'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.groupTeamIds.map((group) => group.length)).toEqual([4, 4, 3]);
    expect(result.value.explanation.seededTeamIds).toHaveLength(5);
    expect(result.value.draw.payload).toEqual({
      kind: 'GROUPS',
      groups: result.value.groupTeamIds,
    });
  });

  it('repeats exactly with the same seed', () => {
    const input = {
      teams: teams(8, 2),
      groupCount: 2,
      drawId: 'draw-1',
      seed: 'same-seed',
      createdAt: '2026-11-24T00:00:00.000Z',
      rng: createSeededRng('same-seed'),
    };
    const first = createGroupDrawPlan(input);
    const second = createGroupDrawPlan({ ...input, rng: createSeededRng('same-seed') });
    expect(first).toEqual(second);
  });
});

describe('moveTeamBetweenGroups', () => {
  it('swaps teams between groups and preserves their configured sizes', () => {
    expect(
      moveTeamBetweenGroups(
        [
          ['a', 'b'],
          ['c', 'd'],
          ['e', 'f', 'g'],
        ],
        [2, 2, 3],
        { teamId: 'a', swapTeamId: 'd', fromGroup: 0, toGroup: 1 },
      ),
    ).toEqual({
      ok: true,
      value: [
        ['d', 'b'],
        ['c', 'a'],
        ['e', 'f', 'g'],
      ],
    });

    expect(
      moveTeamBetweenGroups(
        [
          ['a', 'b', 'c', 'd'],
          ['e', 'f', 'g', 'h'],
          ['i', 'j', 'k'],
        ],
        [4, 4, 3],
        { teamId: 'a', swapTeamId: 'k', fromGroup: 0, toGroup: 2 },
      ),
    ).toEqual({
      ok: true,
      value: [
        ['k', 'b', 'c', 'd'],
        ['e', 'f', 'g', 'h'],
        ['i', 'j', 'a'],
      ],
    });
  });

  it('rejects a swap when the selected team is not in the destination group', () => {
    expect(
      moveTeamBetweenGroups(
        [
          ['a', 'b'],
          ['c', 'd'],
        ],
        [2, 2],
        { teamId: 'a', swapTeamId: 'e', fromGroup: 0, toGroup: 1 },
      ),
    ).toEqual({
      ok: false,
      error: { code: 'teamNotInTarget', messageKey: 'groupDraw.teamNotInTarget' },
    });
  });
});

it('creates persisted group entities from a plan', () => {
  expect(groupsFromPlan('stage-1', [['a'], ['b']], ['group-1', 'group-2'])).toEqual([
    { id: 'group-1', stageId: 'stage-1', name: 'A', teamIds: ['a'] },
    { id: 'group-2', stageId: 'stage-1', name: 'B', teamIds: ['b'] },
  ]);
});
