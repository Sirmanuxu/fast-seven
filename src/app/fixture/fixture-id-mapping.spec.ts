import { describe, expect, it } from 'vitest';
import { GeneratedFixture, assignGeneratedFixtureIds } from './fixture-id-mapping';

describe('assignGeneratedFixtureIds', () => {
  it('creates UUID-ready entity ids and remaps every fixture reference', () => {
    const fixture: GeneratedFixture = {
      stages: [{ id: 'stage-old', type: 'KNOCKOUT', name: 'Eliminación', order: 1, cup: null }],
      groups: [{ id: 'group-old', stageId: 'stage-old', name: 'A', teamIds: ['team-a', 'team-b'] }],
      matches: [
        {
          id: 'source',
          stageId: 'stage-old',
          groupId: 'group-old',
          round: 1,
          order: 1,
          label: null,
          home: { kind: 'TEAM', teamId: 'team-a' },
          away: { kind: 'TEAM', teamId: 'team-b' },
          status: 'PENDING',
          result: null,
          startedAt: null,
          finishedAt: null,
          isPhantom: false,
          isConditional: false,
        },
        {
          id: 'next',
          stageId: 'stage-old',
          groupId: null,
          round: 2,
          order: 2,
          label: null,
          home: { kind: 'WINNER_OF', matchId: 'source' },
          away: { kind: 'BYE' },
          status: 'PENDING',
          result: null,
          startedAt: null,
          finishedAt: null,
          isPhantom: false,
          isConditional: false,
        },
      ],
      newDraws: [
        {
          id: 'draw-old',
          seed: 'generator-default',
          createdAt: '1970-01-01T00:00:00.000Z',
          payload: { kind: 'BRACKET', stageId: 'stage-old', teamOrder: ['team-a', 'team-b'] },
        },
      ],
    };
    let idSequence = 0;

    const result = assignGeneratedFixtureIds(
      fixture,
      () => `uuid-${++idSequence}`,
      'saved-seed',
      '2026-11-25T10:00:00.000Z',
    );

    expect(result.stages[0].id).toBe('uuid-1');
    expect(result.groups[0].stageId).toBe(result.stages[0].id);
    expect(result.matches[0].stageId).toBe(result.stages[0].id);
    expect(result.matches[0].groupId).toBe(result.groups[0].id);
    expect(result.matches[1].home).toEqual({ kind: 'WINNER_OF', matchId: result.matches[0].id });
    expect(result.draws[0]).toMatchObject({
      id: 'uuid-5',
      seed: 'saved-seed',
      createdAt: '2026-11-25T10:00:00.000Z',
      payload: { kind: 'BRACKET', stageId: result.stages[0].id },
    });
  });
});
