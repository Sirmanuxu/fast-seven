import { describe, expect, it } from 'vitest';
import { Tournament, TournamentSnapshot } from './model';
import {
  canCloseTournament,
  closeTournament,
  reopenTournamentAfterMatchEdit,
} from './tournament-close';

function tournament(status: Tournament['status'] = 'RUNNING'): Tournament {
  return {
    id: 't',
    name: 'Test',
    date: '2026-11-27T00:00:00.000Z',
    status,
    formatParams: null,
    rules: {
      points: {
        win: 3,
        draw: 2,
        loss: 1,
        walkoverLoss: 0,
        bonus: { triesThreshold: null, triesBonusPoints: 0, losingMarginMax: null, losingBonusPoints: 0 },
      },
      tiebreakers: ['HEAD_TO_HEAD', 'POINT_DIFFERENCE', 'DRAW'],
      walkoverScore: { winner: 28, loser: 0 },
      bye: { awardsWinPoints: true, countsScore: false },
      roster: { min: 7, max: null },
    },
    schedule: { startTime: '2026-11-27T10:00:00.000Z', matchDurationMin: 14, restMin: 2, breaks: [] },
    categories: [],
    backupIntervalMin: 10,
    schemaVersion: 1,
    createdAt: '2026-11-27T00:00:00.000Z',
    updatedAt: '2026-11-27T00:00:00.000Z',
  };
}

function snapshot(status: Tournament['status'], matchStatus: 'PENDING' | 'FINISHED'): TournamentSnapshot {
  return {
    tournament: tournament(status),
    players: [],
    teams: [],
    stages: [],
    groups: [],
    matches: [
      {
        id: 'm',
        stageId: 'stage',
        groupId: null,
        round: 1,
        order: 1,
        label: null,
        home: { kind: 'TEAM', teamId: 'A' },
        away: { kind: 'TEAM', teamId: 'B' },
        status: matchStatus,
        result:
          matchStatus === 'FINISHED'
            ? {
                mode: 'DIRECT',
                homePoints: 7,
                awayPoints: 5,
                definition: 'REGULAR',
                winnerTeamId: null,
              }
            : null,
        startedAt: null,
        finishedAt: null,
        isPhantom: false,
        isConditional: false,
      },
    ],
    events: [],
    draws: [],
  };
}

describe('tournament close', () => {
  it('offers closure only when every counted match is finished', () => {
    expect(canCloseTournament(snapshot('RUNNING', 'PENDING'))).toBe(false);
    expect(canCloseTournament(snapshot('RUNNING', 'FINISHED'))).toBe(true);
  });

  it('closes the tournament and records the closure time', () => {
    const result = closeTournament(
      tournament(),
      snapshot('RUNNING', 'FINISHED').matches,
      { nowMs: () => Date.parse('2026-11-27T12:00:00.000Z') },
    );
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        status: 'FINISHED',
        updatedAt: '2026-11-27T12:00:00.000Z',
      }),
    });
  });

  it('rejects closing while a counted match is pending', () => {
    expect(
      closeTournament(
        tournament(),
        snapshot('RUNNING', 'PENDING').matches,
        { nowMs: () => Date.parse('2026-11-27T12:00:00.000Z') },
      ),
    ).toEqual({ ok: false, error: 'pendingMatches' });
  });

  it('reopens a finished tournament after a result edit leaves a match pending', () => {
    const reopened = reopenTournamentAfterMatchEdit(
      tournament('FINISHED'),
      snapshot('FINISHED', 'PENDING').matches,
      '2026-11-27T13:00:00.000Z',
    );
    expect(reopened.status).toBe('RUNNING');
  });
});
