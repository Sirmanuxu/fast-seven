import { describe, expect, it } from 'vitest';
import { buildMatchControlView, startMatch } from './match-control';
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
