import { describe, expect, it } from 'vitest';
import { Tournament } from './model';
import { startTournament } from './start-tournament';

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

describe('startTournament', () => {
  it('moves a generated tournament to running without changing the fixture', () => {
    const original = tournament('FIXTURE_GENERATED');

    expect(startTournament(original, '2026-11-26T12:00:00Z')).toEqual({
      ok: true,
      value: {
        ...original,
        status: 'RUNNING',
        updatedAt: '2026-11-26T12:00:00Z',
      },
    });
    expect(original.status).toBe('FIXTURE_GENERATED');
  });

  it('rejects starting before fixture generation or after the tournament has started', () => {
    expect(startTournament(tournament('SETUP'), 'now')).toEqual({
      ok: false,
      error: 'fixtureNotReady',
    });
    expect(startTournament(tournament('RUNNING'), 'now')).toEqual({
      ok: false,
      error: 'fixtureNotReady',
    });
    expect(startTournament(tournament('FINISHED'), 'now')).toEqual({
      ok: false,
      error: 'fixtureNotReady',
    });
  });
});
