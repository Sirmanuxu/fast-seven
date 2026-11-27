import { describe, expect, it } from 'vitest';
import { TournamentSnapshot } from '../domain/model';
import { createTournamentFile, createTournamentFileName, checksumTournamentData } from './tournament-file';

function snapshot(name = 'Tournament'): TournamentSnapshot {
  const timestamp = '2026-11-25T00:00:00.000Z';
  return {
    tournament: {
      id: 'tournament',
      name,
      date: timestamp,
      status: 'SETUP',
      formatParams: null,
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
      backupIntervalMin: 5,
      schemaVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    players: [],
    teams: [],
    stages: [],
    groups: [],
    matches: [],
    events: [],
    draws: [],
  };
}

describe('tournament file', () => {
  it('creates a versioned file with a checksum of the complete snapshot', async () => {
    const data = snapshot();
    const file = await createTournamentFile(data, '0.49.0', '2026-11-27T00:00:00.000Z');

    expect(file).toMatchObject({
      kind: 'rugby7-tournament',
      schemaVersion: 2,
      appVersion: '0.49.0',
      exportedAt: '2026-11-27T00:00:00.000Z',
      data,
    });
    expect(file.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(file.checksum).toBe(await checksumTournamentData(data));
  });

  it('changes the checksum when tournament data changes', async () => {
    expect(await checksumTournamentData(snapshot('Tournament'))).not.toBe(
      await checksumTournamentData(snapshot('Changed')),
    );
  });

  it('creates a filesystem-safe name with the requested timestamp', () => {
    expect(createTournamentFileName('Club Ñandú', new Date(2026, 0, 2, 3, 4))).toBe(
      'torneo-club-nandu-20260102-0304.json',
    );
  });
});
