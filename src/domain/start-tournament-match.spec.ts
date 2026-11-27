import { describe, expect, it } from 'vitest';
import { Match, Tournament } from './model';
import { startTournamentMatch } from './start-tournament-match';

function tournament(status: Tournament['status']): Tournament {
  return {
    id: 'tournament',
    name: 'Tournament',
    date: '2026-11-25T00:00:00.000Z',
    status,
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
    createdAt: '2026-11-25T00:00:00.000Z',
    updatedAt: '2026-11-25T00:00:00.000Z',
  };
}

function match(status: Match['status'] = 'PENDING'): Match {
  return {
    id: 'match',
    stageId: 'stage',
    groupId: null,
    round: 1,
    order: 1,
    label: null,
    home: { kind: 'TEAM', teamId: 'home' },
    away: { kind: 'TEAM', teamId: 'away' },
    status,
    result: null,
    startedAt: null,
    finishedAt: null,
    isPhantom: false,
    isConditional: false,
  };
}

describe('startTournamentMatch', () => {
  it('starts the first match and requests a pre-start backup', () => {
    const originalTournament = tournament('FIXTURE_GENERATED');
    const originalMatch = match();
    const started = startTournamentMatch(originalTournament, originalMatch, '2026-11-26T12:00:00Z');

    expect(started).toEqual({
      ok: true,
      value: {
        tournament: { ...originalTournament, status: 'RUNNING', updatedAt: '2026-11-26T12:00:00Z' },
        match: { ...originalMatch, status: 'IN_PROGRESS', startedAt: '2026-11-26T12:00:00Z' },
        requiresBackup: true,
      },
    });
    expect(originalTournament.status).toBe('FIXTURE_GENERATED');
    expect(originalMatch.status).toBe('PENDING');
  });

  it('does not request another tournament-start backup for a later match', () => {
    const started = startTournamentMatch(tournament('RUNNING'), match(), '2026-11-26T12:00:00Z');

    expect(started.ok && started.value.requiresBackup).toBe(false);
  });

  it('rejects a match before a fixture exists or after the tournament finishes', () => {
    expect(startTournamentMatch(tournament('SETUP'), match(), 'now')).toEqual({
      ok: false,
      error: 'fixtureNotReady',
    });
    expect(startTournamentMatch(tournament('FINISHED'), match(), 'now')).toEqual({
      ok: false,
      error: 'fixtureNotReady',
    });
  });

  it('rejects a match that is no longer pending', () => {
    expect(
      startTournamentMatch(tournament('FIXTURE_GENERATED'), match('IN_PROGRESS'), 'now'),
    ).toEqual({ ok: false, error: 'matchNotPending' });
  });
});
