import { describe, expect, it } from 'vitest';
import { createTeamDrawPlan } from './team-draw';
import { createSeededRng } from './rng';

const player = (id: string, category = 'M16', gender: 'M' | 'F' = 'M') => ({
  id,
  firstName: id,
  lastName: 'Player',
  category,
  gender,
  teamId: null,
  disambiguation: null,
  normalizedKey: id,
});

describe('createTeamDrawPlan', () => {
  it('creates balanced assignments and persists the teams draw payload', () => {
    const result = createTeamDrawPlan({
      players: Array.from({ length: 14 }, (_, index) => player(String(index))),
      targets: [
        { id: 'new-1', currentPlayerCount: 0 },
        { id: 'new-2', currentPlayerCount: 0 },
      ],
      roster: { min: 7, max: 12 },
      balanceByCategoryGender: false,
      drawId: 'draw-1',
      seed: 'seed-1',
      createdAt: '2026-11-20T15:00:00.000Z',
      rng: createSeededRng('seed-1'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.assignments.map((assignment) => assignment.playerIds.length)).toEqual([
      7, 7,
    ]);
    expect(result.value.draw).toEqual({
      id: 'draw-1',
      seed: 'seed-1',
      createdAt: '2026-11-20T15:00:00.000Z',
      payload: {
        kind: 'TEAMS',
        teams: [result.value.assignments[0].playerIds, result.value.assignments[1].playerIds],
      },
    });
  });

  it('balances category and gender groups in rounds', () => {
    const players = [
      ...Array.from({ length: 4 }, (_, index) => player(`m-${index}`, 'M16', 'M')),
      ...Array.from({ length: 4 }, (_, index) => player(`f-${index}`, 'M16', 'F')),
    ];
    const result = createTeamDrawPlan({
      players,
      targets: [
        { id: 'a', currentPlayerCount: 0 },
        { id: 'b', currentPlayerCount: 0 },
      ],
      roster: { min: 4, max: 4 },
      balanceByCategoryGender: true,
      drawId: 'draw-2',
      seed: 'seed-2',
      createdAt: '2026-11-20T15:00:00.000Z',
      rng: createSeededRng('seed-2'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const assignment of result.value.assignments) {
      const assigned = new Set(assignment.playerIds);
      expect([...assigned].filter((id) => id.startsWith('m-'))).toHaveLength(2);
      expect([...assigned].filter((id) => id.startsWith('f-'))).toHaveLength(2);
    }
  });

  it('reports the maximum possible team count when there are not enough players', () => {
    const result = createTeamDrawPlan({
      players: Array.from({ length: 13 }, (_, index) => player(String(index))),
      targets: [
        { id: 'a', currentPlayerCount: 0 },
        { id: 'b', currentPlayerCount: 0 },
      ],
      roster: { min: 7, max: 12 },
      balanceByCategoryGender: false,
      drawId: 'draw-3',
      seed: 'seed-3',
      createdAt: '2026-11-20T15:00:00.000Z',
      rng: createSeededRng('seed-3'),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'notEnoughPlayers',
        messageKey: 'teamDraw.notEnoughPlayers',
        params: { maximumPossible: 1 },
      },
    });
  });

  it('can complete an existing team without modifying other targets', () => {
    const result = createTeamDrawPlan({
      players: Array.from({ length: 5 }, (_, index) => player(String(index))),
      targets: [{ id: 'existing', currentPlayerCount: 2 }],
      roster: { min: 7, max: 12 },
      balanceByCategoryGender: false,
      drawId: 'draw-4',
      seed: 'seed-4',
      createdAt: '2026-11-20T15:00:00.000Z',
      rng: createSeededRng('seed-4'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.assignments[0].playerIds).toHaveLength(5);
  });
});
