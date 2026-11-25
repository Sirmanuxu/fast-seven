import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Match, Team, Tournament } from '../domain/model';
import { TournamentRepository } from './tournament-repository';
import { tournamentDatabase } from './tournament-database';

function match(id: string, order: number, status: Match['status'] = 'PENDING'): Match {
  return {
    id,
    stageId: 'stage',
    groupId: null,
    round: 1,
    order,
    label: null,
    home: { kind: 'TEAM', teamId: `${id}-home` },
    away: { kind: 'TEAM', teamId: `${id}-away` },
    status,
    result: null,
    startedAt: null,
    finishedAt: null,
    isPhantom: false,
    isConditional: false,
  };
}

function team(id: string): Team {
  return {
    id,
    name: id,
    primaryColor: '#000000',
    secondaryColor: '#ffffff',
    captainId: null,
    logo: null,
    isSeed: false,
    status: 'ACTIVE',
  };
}

function tournament(status: Tournament['status'] = 'SETUP'): Tournament {
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

describe('TournamentRepository.updateMatchOrders', () => {
  beforeEach(() => {
    vi.spyOn(tournamentDatabase, 'transaction').mockImplementation((_mode, ...arguments_) => {
      const operation = arguments_.find((argument) => typeof argument === 'function');
      if (typeof operation !== 'function') {
        return Dexie.Promise.reject(new Error('Transaction scope is missing'));
      }
      return Dexie.Promise.resolve(Reflect.apply(operation, undefined, []));
    });
    vi.spyOn(tournamentDatabase.matches, 'toArray').mockResolvedValue([
      match('one', 1),
      match('two', 2),
    ]);
    vi.spyOn(tournamentDatabase.matches, 'bulkUpdate').mockResolvedValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updates order fields atomically without replacing other match data', async () => {
    const repository = new TournamentRepository();
    vi.spyOn(repository, 'getTournament').mockResolvedValue(null);

    await repository.updateMatchOrders([
      { matchId: 'one', order: 2 },
      { matchId: 'two', order: 1 },
    ]);

    expect(tournamentDatabase.transaction).toHaveBeenCalledWith(
      'rw',
      tournamentDatabase.matches,
      tournamentDatabase.tournament,
      expect.any(Function),
    );
    expect(tournamentDatabase.matches.bulkUpdate).toHaveBeenCalledWith([
      { key: 'one', changes: { order: 2 } },
      { key: 'two', changes: { order: 1 } },
    ]);
  });

  it('rejects attempts to change the order of a match that is no longer pending', async () => {
    vi.spyOn(tournamentDatabase.matches, 'toArray').mockResolvedValue([
      match('finished', 1, 'FINISHED'),
      match('pending', 2),
    ]);
    const repository = new TournamentRepository();

    await expect(repository.updateMatchOrders([{ matchId: 'finished', order: 2 }])).rejects.toThrow(
      'is no longer reorderable',
    );
    expect(tournamentDatabase.matches.bulkUpdate).not.toHaveBeenCalled();
  });

  it('rejects duplicate positions instead of persisting an invalid fixture order', async () => {
    const repository = new TournamentRepository();

    await expect(repository.updateMatchOrders([{ matchId: 'one', order: 2 }])).rejects.toThrow(
      'duplicate positions',
    );
    expect(tournamentDatabase.matches.bulkUpdate).not.toHaveBeenCalled();
  });
});

describe('TournamentRepository.saveFixture', () => {
  beforeEach(() => {
    vi.spyOn(tournamentDatabase, 'transaction').mockImplementation((_mode, ...arguments_) => {
      const operation = arguments_.find((argument) => typeof argument === 'function');
      if (typeof operation !== 'function') {
        return Dexie.Promise.reject(new Error('Transaction scope is missing'));
      }
      return Dexie.Promise.resolve(Reflect.apply(operation, undefined, []));
    });
    vi.spyOn(tournamentDatabase.teams, 'toArray').mockResolvedValue([team('home'), team('away')]);
    vi.spyOn(tournamentDatabase.draws, 'toArray').mockResolvedValue([]);
    vi.spyOn(tournamentDatabase.stages, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.groups, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.matches, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.events, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.draws, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.matches, 'bulkPut').mockResolvedValue('fixture-match');
    vi.spyOn(tournamentDatabase.tournament, 'update').mockResolvedValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saves fixture entities and tournament status in one transaction', async () => {
    const repository = new TournamentRepository();
    vi.spyOn(repository, 'getTournament').mockResolvedValue(tournament());

    await repository.saveFixture({
      formatParams: { format: 'ROUND_ROBIN', rounds: 1 },
      stages: [],
      groups: [],
      matches: [match('fixture-match', 1)],
      draws: [],
    });

    expect(tournamentDatabase.transaction).toHaveBeenCalledWith(
      'rw',
      expect.arrayContaining(['tournament', 'stages', 'groups', 'matches', 'events', 'draws']),
      expect.any(Function),
    );
    expect(tournamentDatabase.matches.bulkPut).toHaveBeenCalledWith([match('fixture-match', 1)]);
    expect(tournamentDatabase.tournament.update).toHaveBeenCalledWith(
      'tournament',
      expect.objectContaining({ status: 'FIXTURE_GENERATED' }),
    );
  });

  it('blocks fixture generation when fewer than two active teams remain', async () => {
    vi.spyOn(tournamentDatabase.teams, 'toArray').mockResolvedValue([team('home')]);
    const repository = new TournamentRepository();
    vi.spyOn(repository, 'getTournament').mockResolvedValue(tournament());

    await expect(
      repository.saveFixture({
        formatParams: { format: 'ROUND_ROBIN', rounds: 1 },
        stages: [],
        groups: [],
        matches: [match('fixture-match', 1)],
        draws: [],
      }),
    ).rejects.toThrow('At least two active teams');
    expect(tournamentDatabase.matches.clear).not.toHaveBeenCalled();
  });
});

describe('TournamentRepository.updateFormat', () => {
  beforeEach(() => {
    vi.spyOn(tournamentDatabase, 'transaction').mockImplementation((_mode, ...arguments_) => {
      const operation = arguments_.find((argument) => typeof argument === 'function');
      if (typeof operation !== 'function') {
        return Dexie.Promise.reject(new Error('Transaction scope is missing'));
      }
      return Dexie.Promise.resolve(Reflect.apply(operation, undefined, []));
    });
    vi.spyOn(tournamentDatabase.stages, 'toArray').mockResolvedValue([]);
    vi.spyOn(tournamentDatabase.groups, 'toArray').mockResolvedValue([]);
    vi.spyOn(tournamentDatabase.matches, 'toArray').mockResolvedValue([]);
    vi.spyOn(tournamentDatabase.events, 'toArray').mockResolvedValue([]);
    vi.spyOn(tournamentDatabase.draws, 'toArray').mockResolvedValue([]);
    vi.spyOn(tournamentDatabase.tournament, 'update').mockResolvedValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clears schedule breaks when changing format so they cannot point to deleted matches', async () => {
    const repository = new TournamentRepository();
    const existing = {
      ...tournament(),
      schedule: {
        startTime: '2026-11-25T10:00:00.000Z',
        matchDurationMin: 20,
        restMin: 5,
        breaks: [{ id: 'break', label: 'Pausa', durationMin: 30, beforeMatchId: 'old-match' }],
      },
    };
    vi.spyOn(repository, 'getTournament').mockResolvedValue(existing);

    await repository.updateFormat({ format: 'KNOCKOUT', thirdPlaceMatch: false });

    expect(tournamentDatabase.tournament.update).toHaveBeenCalledWith(
      'tournament',
      expect.objectContaining({
        formatParams: { format: 'KNOCKOUT', thirdPlaceMatch: false },
        schedule: { ...existing.schedule, breaks: [] },
      }),
    );
  });
});
