import { describe, expect, it } from 'vitest';
import { movePendingMatch, resetSuggestedMatchOrder } from './match-order';
import { Match, MatchRef } from './model';

function match(
  id: string,
  order: number,
  home: MatchRef = { kind: 'TEAM', teamId: `${id}-home` },
  away: MatchRef = { kind: 'TEAM', teamId: `${id}-away` },
  options: Partial<Match> = {},
): Match {
  return {
    id,
    stageId: 'knockout',
    groupId: null,
    round: 1,
    order,
    label: null,
    home,
    away,
    status: 'PENDING',
    result: null,
    startedAt: null,
    finishedAt: null,
    isPhantom: false,
    isConditional: false,
    ...options,
  };
}

function orderedIds(matches: readonly Match[]): readonly string[] {
  return [...matches].sort((left, right) => left.order - right.order).map((entry) => entry.id);
}

describe('pending match order', () => {
  it('moves a pending match one position and does not mutate the input', () => {
    const matches = [match('first', 1), match('second', 2), match('third', 3)];
    const result = movePendingMatch(matches, 'third', 'UP');

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(orderedIds(result.value)).toEqual(['first', 'third', 'second']);
    expect(matches.map((entry) => entry.order)).toEqual([1, 2, 3]);
  });

  it('rejects unknown, completed, phantom and boundary matches', () => {
    const matches = [
      match('finished', 1, undefined, undefined, { status: 'FINISHED' }),
      match('phantom', 2, undefined, undefined, { isPhantom: true }),
      match('pending', 3),
    ];

    expect(movePendingMatch(matches, 'missing', 'UP')).toMatchObject({
      ok: false,
      error: { code: 'matchNotFound' },
    });
    expect(movePendingMatch(matches, 'finished', 'DOWN')).toMatchObject({
      ok: false,
      error: { code: 'matchNotPending' },
    });
    expect(movePendingMatch(matches, 'phantom', 'DOWN')).toMatchObject({
      ok: false,
      error: { code: 'matchNotReorderable' },
    });
    expect(movePendingMatch([match('only', 1)], 'only', 'UP')).toMatchObject({
      ok: false,
      error: { code: 'matchAtBoundary' },
    });
  });

  it('does not allow a pending match to cross a finished or in-progress match', () => {
    const matches = [
      match('pending-first', 1),
      match('live', 2, undefined, undefined, { status: 'IN_PROGRESS' }),
      match('pending-last', 3),
    ];

    expect(movePendingMatch(matches, 'pending-first', 'DOWN')).toMatchObject({
      ok: false,
      error: { code: 'lockedMatch' },
    });
    expect(movePendingMatch(matches, 'pending-last', 'UP')).toMatchObject({
      ok: false,
      error: { code: 'lockedMatch' },
    });
  });

  it('blocks moves that would place a dependent match before its source', () => {
    const source = match('source', 1);
    const dependent = match(
      'dependent',
      2,
      { kind: 'WINNER_OF', matchId: 'source' },
      { kind: 'TEAM', teamId: 'other' },
    );

    expect(movePendingMatch([source, dependent], 'source', 'DOWN')).toMatchObject({
      ok: false,
      error: { code: 'dependencyWouldBeBroken', params: { matchId: 'dependent' } },
    });
  });

  it('restores suggested order within pending segments without moving locked matches', () => {
    const matches = [
      match('pending-before', 1),
      match('finished', 2, undefined, undefined, { status: 'FINISHED' }),
      match('pending-a', 3),
      match('pending-b', 4),
    ];

    const result = resetSuggestedMatchOrder(matches, ['pending-before', 'pending-b', 'pending-a']);

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(orderedIds(result.value)).toEqual([
      'pending-before',
      'finished',
      'pending-b',
      'pending-a',
    ]);
  });

  it('rejects an incomplete suggested order', () => {
    const result = resetSuggestedMatchOrder([match('one', 1), match('two', 2)], ['one']);

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'invalidSuggestedOrder' },
    });
  });
});
