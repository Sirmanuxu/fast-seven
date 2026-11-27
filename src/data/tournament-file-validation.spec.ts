import { describe, expect, it } from 'vitest';
import { TournamentSnapshot } from '../domain/model';
import { checksumTournamentValue } from './tournament-file';
import { validateTournamentFileText } from './tournament-file-validation';

function snapshot(): TournamentSnapshot {
  const timestamp = '2026-11-25T00:00:00.000Z';
  return {
    tournament: {
      id: 'tournament',
      name: 'Tournament',
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
      schemaVersion: 2,
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

async function encodedFile(schemaVersion = 2, data: unknown = snapshot()): Promise<string> {
  return JSON.stringify({
    kind: 'rugby7-tournament',
    schemaVersion,
    appVersion: '0.49.0',
    exportedAt: '2026-11-27T00:00:00.000Z',
    checksum: await checksumTournamentValue(data),
    data,
  });
}

describe('tournament file validation', () => {
  it('accepts a current complete file', async () => {
    const result = await validateTournamentFileText(await encodedFile());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.file.schemaVersion).toBe(2);
      expect(result.value.file.data.tournament.name).toBe('Tournament');
      expect(result.value.migrated).toBe(false);
    }
  });

  it('rejects invalid JSON and checksum mismatches', async () => {
    expect(await validateTournamentFileText('{')).toMatchObject({
      ok: false,
      error: 'INVALID_JSON',
    });

    const file = JSON.parse(await encodedFile()) as Record<string, unknown>;
    file['checksum'] = '0'.repeat(64);
    expect(await validateTournamentFileText(JSON.stringify(file))).toMatchObject({
      ok: false,
      error: 'CHECKSUM_MISMATCH',
    });
  });

  it('rejects a schema newer than the running application', async () => {
    expect(await validateTournamentFileText(await encodedFile(3))).toMatchObject({
      ok: false,
      error: 'NEWER_SCHEMA',
    });
  });

  it('migrates schema 1 by restoring its historical backup interval default', async () => {
    const current = snapshot();
    const legacyTournament = { ...current.tournament, schemaVersion: 1 };
    Reflect.deleteProperty(legacyTournament, 'backupIntervalMin');
    const legacyData = {
      ...current,
      tournament: { ...legacyTournament, schemaVersion: 1 },
    };
    const result = await validateTournamentFileText(await encodedFile(1, legacyData));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.migrated).toBe(true);
      expect(result.value.file.data.tournament.backupIntervalMin).toBe(5);
      expect(result.value.file.data.tournament.schemaVersion).toBe(2);
    }
  });

  it('rejects snapshots with missing entity IDs or broken references', async () => {
    const noTournamentId = {
      ...snapshot(),
      tournament: { ...snapshot().tournament, id: '' },
    };
    expect(await validateTournamentFileText(await encodedFile(2, noTournamentId))).toMatchObject({
      ok: false,
      error: 'MISSING_IDS',
    });

    const brokenReference = {
      ...snapshot(),
      players: [
        {
          id: 'player',
          firstName: 'First',
          lastName: 'Last',
          category: 'M16',
          gender: 'M',
          teamId: 'missing-team',
          disambiguation: null,
          normalizedKey: 'first last m16',
        },
      ],
    };
    expect(await validateTournamentFileText(await encodedFile(2, brokenReference))).toMatchObject({
      ok: false,
      error: 'INVALID_REFERENCES',
    });
  });

  it('surfaces non-critical invariant violations in the confirmation summary', async () => {
    const data = snapshot();
    const timestamp = '2026-11-25T00:00:00.000Z';
    const inconsistentSnapshot: TournamentSnapshot = {
      ...data,
      teams: [
        {
          id: 'team-one',
          name: 'Club',
          primaryColor: '#000000',
          secondaryColor: '#ffffff',
          captainId: null,
          logo: null,
          isSeed: false,
          status: 'ACTIVE',
        },
        {
          id: 'team-two',
          name: 'Club',
          primaryColor: '#111111',
          secondaryColor: '#eeeeee',
          captainId: null,
          logo: null,
          isSeed: false,
          status: 'ACTIVE',
        },
      ],
      stages: [{ id: 'stage', type: 'LEAGUE', name: 'Liga', order: 1, cup: null }],
      matches: ['match-one', 'match-two'].map((id) => ({
        id,
        stageId: 'stage',
        groupId: null,
        round: 1,
        order: 1,
        label: null,
        home: { kind: 'BYE' as const },
        away: { kind: 'BYE' as const },
        status: 'IN_PROGRESS' as const,
        result: null,
        startedAt: timestamp,
        finishedAt: null,
        isPhantom: false,
        isConditional: false,
      })),
    };

    const result = await validateTournamentFileText(await encodedFile(2, inconsistentSnapshot));

    expect(result).toMatchObject({
      ok: true,
      value: {
        warnings: ['DUPLICATE_TEAM_NAMES', 'MULTIPLE_MATCHES_IN_PROGRESS'],
      },
    });
  });
});
