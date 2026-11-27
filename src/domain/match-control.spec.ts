import { describe, expect, it } from 'vitest';
import {
  buildMatchControlView,
  finishDetailMatch,
  finishDirectMatch,
  finishWalkover,
  startMatch,
  switchDirectToDetail,
  undoWalkover,
} from './match-control';
import { createFixedClock } from './clock';
import { Match, ResolvedMatch, TournamentSnapshot } from './model';

function match(id: string, order: number, status: Match['status'] = 'PENDING'): Match {
  return {
    id,
    stageId: 'stage',
    groupId: null,
    round: 1,
    order,
    label: null,
    home: { kind: 'TEAM', teamId: `home-${id}` },
    away: { kind: 'TEAM', teamId: `away-${id}` },
    status,
    result: null,
    startedAt: null,
    finishedAt: null,
    isPhantom: false,
    isConditional: false,
  };
}

function resolved(matchId: string, isPlayable = true): ResolvedMatch {
  return {
    matchId,
    homeTeamId: `home-${matchId}`,
    awayTeamId: `away-${matchId}`,
    homeLabel: `Home ${matchId}`,
    awayLabel: `Away ${matchId}`,
    isPlayable,
  };
}

function snapshot(matches: readonly Match[]): TournamentSnapshot {
  return {
    tournament: {
      id: 'tournament',
      name: 'Tournament',
      date: '2026-11-26T00:00:00.000Z',
      status: 'RUNNING',
      formatParams: { format: 'ROUND_ROBIN', rounds: 1 },
      rules: {
        points: {
          win: 3,
          draw: 2,
          loss: 1,
          walkoverLoss: 0,
          bonus: {
            triesThreshold: null,
            triesBonusPoints: 0,
            losingMarginMax: null,
            losingBonusPoints: 0,
          },
        },
        tiebreakers: ['DRAW'],
        walkoverScore: { winner: 28, loser: 0 },
        bye: { awardsWinPoints: true, countsScore: false },
        roster: { min: 7, max: 12 },
      },
      schedule: { startTime: null, matchDurationMin: 20, restMin: 5, breaks: [] },
      categories: [],
      backupIntervalMin: 10,
      schemaVersion: 1,
      createdAt: '2026-11-26T00:00:00.000Z',
      updatedAt: '2026-11-26T00:00:00.000Z',
    },
    players: [],
    teams: [],
    stages: [],
    groups: [],
    matches,
    events: [],
    draws: [],
  };
}

describe('match control', () => {
  it('finishes a pending match as a walkover with the configured score and resolved winner', () => {
    const pending = match('one', 1);
    const base = snapshot([pending]);

    const result = finishWalkover(
      base,
      [resolved('one')],
      'one',
      'home-one',
      createFixedClock(Date.parse('2026-11-26T12:40:00.000Z')),
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: 'FINISHED',
        result: {
          mode: 'WALKOVER',
          homePoints: 0,
          awayPoints: 28,
          definition: 'WALKOVER',
          winnerTeamId: 'away-one',
        },
        finishedAt: '2026-11-26T12:40:00.000Z',
      },
    });
    expect(pending.status).toBe('PENDING');
  });

  it('uses the configured losing score when the away team does not show up', () => {
    const base = snapshot([match('one', 1)]);
    const customScore = {
      ...base,
      tournament: {
        ...base.tournament,
        rules: {
          ...base.tournament.rules,
          walkoverScore: { winner: 31, loser: 2 },
        },
      },
    };

    const result = finishWalkover(
      customScore,
      [resolved('one')],
      'one',
      'away-one',
      createFixedClock(0),
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        result: {
          homePoints: 31,
          awayPoints: 2,
          winnerTeamId: 'home-one',
        },
      },
    });
  });

  it('rejects a walkover for a team that is not in the match', () => {
    const result = finishWalkover(
      snapshot([match('one', 1)]),
      [resolved('one')],
      'one',
      'unrelated-team',
      createFixedClock(0),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'invalidAbsentTeam' },
    });
  });

  it('undoes a finished walkover back to pending without changing the original match', () => {
    const pending = match('one', 1);
    const base = snapshot([pending]);
    const finished = finishWalkover(
      base,
      [resolved('one')],
      'one',
      'home-one',
      createFixedClock(0),
    );
    if (!finished.ok) throw new Error('Expected walkover to finish');

    const undone = undoWalkover(
      { ...base, matches: [finished.value] },
      'one',
    );

    expect(undone).toMatchObject({
      ok: true,
      value: { status: 'PENDING', result: null, finishedAt: null },
    });
    expect(pending.status).toBe('PENDING');
  });

  it('finishes a detail match with the recomputed score', () => {
    const live = match('one', 1, 'IN_PROGRESS');
    const base = snapshot([live]);
    const event = {
      id: 'try-1',
      matchId: 'one',
      teamId: 'home-one',
      type: 'TRY' as const,
      playerId: null,
      createdAt: '2026-11-26T12:34:56.000Z',
    };

    const result = finishDetailMatch(
      base,
      [resolved('one')],
      'one',
      [event],
      createFixedClock(Date.parse('2026-11-26T12:40:00.000Z')),
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: 'FINISHED',
        result: {
          mode: 'DETAIL',
          homePoints: 5,
          awayPoints: 0,
          definition: 'REGULAR',
        },
        finishedAt: '2026-11-26T12:40:00.000Z',
      },
    });
  });

  it('finishes a direct match with integer scores and no events', () => {
    const live = match('one', 1, 'IN_PROGRESS');
    const base = snapshot([live]);

    const result = finishDirectMatch(
      base,
      [resolved('one')],
      'one',
      13,
      8,
      createFixedClock(Date.parse('2026-11-26T12:40:00.000Z')),
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: 'FINISHED',
        result: {
          mode: 'DIRECT',
          homePoints: 13,
          awayPoints: 8,
          definition: 'REGULAR',
        },
        finishedAt: '2026-11-26T12:40:00.000Z',
      },
    });
  });

  it('rejects negative and fractional direct scores', () => {
    const live = match('one', 1, 'IN_PROGRESS');

    expect(
      finishDirectMatch(
        snapshot([live]),
        [resolved('one')],
        'one',
        -1,
        7.5,
        createFixedClock(0),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalidDirectScore' },
    });
  });

  it('switches a finished direct match back to detail with a cleared result and events', () => {
    const direct = {
      ...match('one', 1, 'FINISHED'),
      result: {
        mode: 'DIRECT' as const,
        homePoints: 13,
        awayPoints: 8,
        definition: 'REGULAR' as const,
        winnerTeamId: null,
      },
      finishedAt: '2026-11-26T12:40:00.000Z',
    };

    const result = switchDirectToDetail(
      snapshot([direct]),
      'one',
      createFixedClock(Date.parse('2026-11-26T12:45:00.000Z')),
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: 'IN_PROGRESS',
        result: null,
        finishedAt: null,
      },
    });
  });

  it('blocks a tied result in an elimination stage', () => {
    const live = { ...match('one', 1, 'IN_PROGRESS'), stageId: 'knockout' };
    const base = {
      ...snapshot([live]),
      stages: [
        { id: 'knockout', type: 'KNOCKOUT' as const, name: 'Llaves', order: 1, cup: null },
      ],
    };

    const result = finishDetailMatch(
      base,
      [resolved('one')],
      'one',
      [],
      createFixedClock(Date.parse('2026-11-26T12:40:00.000Z')),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'eliminationTie' },
    });
  });

  it('stores a sudden-death winner for a tied elimination detail match', () => {
    const live = { ...match('one', 1, 'IN_PROGRESS'), stageId: 'knockout' };
    const base = {
      ...snapshot([live]),
      stages: [
        { id: 'knockout', type: 'KNOCKOUT' as const, name: 'Llaves', order: 1, cup: null },
      ],
    };
    const events = [
      {
        id: 'try-home',
        matchId: 'one',
        teamId: 'home-one',
        type: 'TRY' as const,
        playerId: null,
        createdAt: '2026-11-26T12:35:00.000Z',
      },
      {
        id: 'try-away',
        matchId: 'one',
        teamId: 'away-one',
        type: 'TRY' as const,
        playerId: null,
        createdAt: '2026-11-26T12:36:00.000Z',
      },
    ];

    const result = finishDetailMatch(
      base,
      [resolved('one')],
      'one',
      events,
      createFixedClock(Date.parse('2026-11-26T12:40:00.000Z')),
      'away-one',
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: 'FINISHED',
        result: {
          mode: 'DETAIL',
          homePoints: 5,
          awayPoints: 5,
          definition: 'SUDDEN_DEATH',
          winnerTeamId: 'away-one',
        },
      },
    });
  });

  it('stores a sudden-death winner for a tied elimination direct match', () => {
    const live = { ...match('one', 1, 'IN_PROGRESS'), stageId: 'knockout' };
    const base = {
      ...snapshot([live]),
      stages: [
        { id: 'knockout', type: 'KNOCKOUT' as const, name: 'Llaves', order: 1, cup: null },
      ],
    };

    const result = finishDirectMatch(
      base,
      [resolved('one')],
      'one',
      15,
      15,
      createFixedClock(Date.parse('2026-11-26T12:40:00.000Z')),
      'home-one',
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: 'FINISHED',
        result: {
          mode: 'DIRECT',
          homePoints: 15,
          awayPoints: 15,
          definition: 'SUDDEN_DEATH',
          winnerTeamId: 'home-one',
        },
      },
    });
  });

  it('rejects a sudden-death winner outside the resolved teams', () => {
    const live = { ...match('one', 1, 'IN_PROGRESS'), stageId: 'knockout' };
    const base = {
      ...snapshot([live]),
      stages: [
        { id: 'knockout', type: 'KNOCKOUT' as const, name: 'Llaves', order: 1, cup: null },
      ],
    };

    const result = finishDirectMatch(
      base,
      [resolved('one')],
      'one',
      15,
      15,
      createFixedClock(Date.parse('2026-11-26T12:40:00.000Z')),
      'other-team',
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'invalidSuddenDeathWinner' },
    });
  });

  it('clears sudden-death fields when a later non-tied direct score is finished', () => {
    const live = { ...match('one', 1, 'IN_PROGRESS'), stageId: 'knockout' };
    const base = {
      ...snapshot([live]),
      stages: [
        { id: 'knockout', type: 'KNOCKOUT' as const, name: 'Llaves', order: 1, cup: null },
      ],
    };

    const result = finishDirectMatch(
      base,
      [resolved('one')],
      'one',
      15,
      12,
      createFixedClock(Date.parse('2026-11-26T12:40:00.000Z')),
      'away-one',
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        result: {
          definition: 'REGULAR',
          winnerTeamId: null,
        },
      },
    });
  });

  it('starts a playable pending match and records the real start time', () => {
    const original = match('one', 1);
    const result = startMatch(
      snapshot([original]),
      [resolved('one')],
      'one',
      createFixedClock(Date.parse('2026-11-26T12:34:56.000Z')),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('IN_PROGRESS');
      expect(result.value.startedAt).toBe('2026-11-26T12:34:56.000Z');
    }
    expect(original.status).toBe('PENDING');
  });

  it('rejects starting when another match is already in progress', () => {
    const result = startMatch(
      snapshot([match('live', 1, 'IN_PROGRESS'), match('next', 2)]),
      [resolved('live'), resolved('next')],
      'next',
      createFixedClock(0),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'matchAlreadyInProgress',
        messageKey: 'matchControl.matchAlreadyInProgress',
      },
    });
  });

  it('rejects starting unresolved teams', () => {
    const result = startMatch(
      snapshot([match('next', 1)]),
      [resolved('next', false)],
      'next',
      createFixedClock(0),
    );

    expect(result.ok).toBe(false);
  });

  it('proposes the first playable match after an unresolved match without changing order', () => {
    const view = buildMatchControlView(
      snapshot([match('blocked', 1), match('playable', 2), match('later', 3)]),
      [resolved('blocked', false), resolved('playable'), resolved('later')],
      ['blocked', 'playable', 'later'],
    );

    expect(view.next?.match.id).toBe('playable');
    expect(view.following.map((entry) => entry.match.id)).toEqual(['later']);
  });
});
