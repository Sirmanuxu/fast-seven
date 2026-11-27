import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Backup,
  Draw,
  FormatParams,
  Match,
  ProjectorState,
  Team,
  Tournament,
  TournamentSnapshot,
} from '../domain/model';
import { TournamentRepository } from './tournament-repository';
import { tournamentDatabase } from './tournament-database';
import { backupCreated, backupQuotaExceeded } from './backup-events';

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

function team(id: string, status: Team['status'] = 'ACTIVE'): Team {
  return {
    id,
    name: id,
    primaryColor: '#000000',
    secondaryColor: '#ffffff',
    captainId: null,
    logo: null,
    isSeed: false,
    status,
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

function snapshot(value = tournament()): TournamentSnapshot {
  return {
    tournament: value,
    players: [],
    teams: [],
    stages: [],
    groups: [],
    matches: [],
    events: [],
    draws: [],
  };
}

describe('TournamentRepository backups', () => {
  beforeEach(() => {
    vi.spyOn(tournamentDatabase, 'transaction').mockImplementation((_mode, ...arguments_) => {
      const operation = arguments_.find((argument) => typeof argument === 'function');
      if (typeof operation !== 'function') {
        return Dexie.Promise.reject(new Error('Transaction scope is missing'));
      }
      return Dexie.Promise.resolve(Reflect.apply(operation, undefined, []));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the tournament-start backup outside the rotating set', async () => {
    const initial: Backup = {
      id: 'initial',
      createdAt: '2026-01-01T00:00:00.000Z',
      reason: 'TOURNAMENT_START',
      snapshot: snapshot(),
    };
    const regular = Array.from(
      { length: 11 },
      (_, index): Backup => ({
        id: `regular-${index}`,
        createdAt: `2026-01-${String(index + 2).padStart(2, '0')}T00:00:00.000Z`,
        reason: 'PERIODIC',
        snapshot: snapshot(),
      }),
    );
    let created: Backup | null = null;
    vi.spyOn(tournamentDatabase.backups, 'add').mockImplementation((backup) => {
      created = backup;
      return Dexie.Promise.resolve(backup.id);
    });
    vi.spyOn(tournamentDatabase.backups, 'toArray').mockImplementation(() =>
      Dexie.Promise.resolve([initial, ...regular, ...(created ? [created] : [])]),
    );
    const deleteBackups = vi
      .spyOn(tournamentDatabase.backups, 'bulkDelete')
      .mockResolvedValue(undefined);
    const backupSnapshot = snapshot();
    const createdEvent = vi.fn();
    const subscription = backupCreated.subscribe(createdEvent);

    await new TournamentRepository().createBackup('PERIODIC', backupSnapshot);

    expect(deleteBackups).toHaveBeenCalledWith(expect.arrayContaining(['regular-0', 'regular-1']));
    expect(createdEvent).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'PERIODIC', snapshot: backupSnapshot }),
    );
    subscription.unsubscribe();
  });

  it('does not create periodic backups without changes and creates one after the interval', async () => {
    const currentSnapshot = snapshot({
      ...tournament('RUNNING'),
      createdAt: '2026-11-27T00:00:00.000Z',
      updatedAt: '2026-11-27T00:10:00.000Z',
      backupIntervalMin: 5,
    });
    const recentBackup: Backup = {
      id: 'recent',
      createdAt: '2026-11-27T00:10:00.000Z',
      reason: 'PERIODIC',
      snapshot: currentSnapshot,
    };
    const repository = new TournamentRepository();
    vi.spyOn(repository, 'getSnapshot').mockResolvedValue(currentSnapshot);
    vi.spyOn(repository, 'getBackups').mockResolvedValue([recentBackup]);
    const createBackup = vi.spyOn(repository, 'createBackup').mockResolvedValue(recentBackup);

    await expect(
      repository.createPeriodicBackupIfDue(Date.parse('2026-11-27T00:14:59.000Z')),
    ).resolves.toBe(false);
    await expect(
      repository.createPeriodicBackupIfDue(Date.parse('2026-11-27T00:15:00.000Z')),
    ).resolves.toBe(false);

    expect(createBackup).not.toHaveBeenCalled();

    vi.spyOn(repository, 'getSnapshot').mockResolvedValue({
      ...currentSnapshot,
      tournament: { ...currentSnapshot.tournament, updatedAt: '2026-11-27T00:15:00.000Z' },
    });
    await expect(
      repository.createPeriodicBackupIfDue(Date.parse('2026-11-27T00:15:00.000Z')),
    ).resolves.toBe(true);

    expect(createBackup).toHaveBeenCalledWith(
      'PERIODIC',
      expect.objectContaining({
        tournament: expect.objectContaining({ updatedAt: '2026-11-27T00:15:00.000Z' }),
      }),
    );
  });

  it('backs up the current state before restoring a selected snapshot', async () => {
    const selectedBackup: Backup = {
      id: 'selected',
      createdAt: '2026-11-26T00:00:00.000Z',
      reason: 'PERIODIC',
      snapshot: snapshot(),
    };
    const currentSnapshot = snapshot({
      ...tournament('RUNNING'),
      updatedAt: '2026-11-27T00:00:00.000Z',
    });
    const repository = new TournamentRepository();
    vi.spyOn(tournamentDatabase.backups, 'get').mockResolvedValue(selectedBackup);
    vi.spyOn(repository, 'getSnapshot').mockResolvedValue(currentSnapshot);
    vi.spyOn(tournamentDatabase.backups, 'add').mockResolvedValue('before-restore');
    vi.spyOn(tournamentDatabase.backups, 'toArray').mockResolvedValue([selectedBackup]);
    vi.spyOn(tournamentDatabase.tournament, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.players, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.teams, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.stages, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.groups, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.matches, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.events, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.draws, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.players, 'bulkPut').mockResolvedValue('players');
    vi.spyOn(tournamentDatabase.teams, 'bulkPut').mockResolvedValue('teams');
    vi.spyOn(tournamentDatabase.stages, 'bulkPut').mockResolvedValue('stages');
    vi.spyOn(tournamentDatabase.groups, 'bulkPut').mockResolvedValue('groups');
    vi.spyOn(tournamentDatabase.matches, 'bulkPut').mockResolvedValue('matches');
    vi.spyOn(tournamentDatabase.events, 'bulkPut').mockResolvedValue('events');
    vi.spyOn(tournamentDatabase.draws, 'bulkPut').mockResolvedValue('draws');
    const restoredTournament = vi
      .spyOn(tournamentDatabase.tournament, 'put')
      .mockResolvedValue('tournament');

    await repository.restoreBackup('selected', '2026-11-27T01:00:00.000Z');

    expect(tournamentDatabase.backups.add).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'MANUAL', snapshot: currentSnapshot }),
    );
    expect(restoredTournament).toHaveBeenCalledWith(
      expect.objectContaining({
        ...selectedBackup.snapshot.tournament,
        updatedAt: '2026-11-27T01:00:00.000Z',
      }),
    );
    expect(tournamentDatabase.transaction).toHaveBeenCalledWith(
      'rw',
      expect.arrayContaining(['tournament', 'players', 'backups', 'draws']),
      expect.any(Function),
    );
  });

  it('backs up and replaces every tournament table atomically when loading a file', async () => {
    const currentSnapshot = snapshot({
      ...tournament('RUNNING'),
      updatedAt: '2026-11-27T00:00:00.000Z',
    });
    const importedSnapshot = snapshot({
      ...tournament('SETUP'),
      id: 'imported',
      name: 'Imported',
    });
    const file = {
      kind: 'rugby7-tournament' as const,
      schemaVersion: 2,
      appVersion: '0.49.0',
      exportedAt: '2026-11-26T00:00:00.000Z',
      checksum: 'a'.repeat(64),
      data: importedSnapshot,
    };
    const repository = new TournamentRepository();
    vi.spyOn(repository, 'getSnapshot').mockResolvedValue(currentSnapshot);
    vi.spyOn(repository, 'getTournamentFileState').mockResolvedValue({
      id: 'current',
      tournamentId: currentSnapshot.tournament.id,
      exportedAt: '2026-11-25T00:00:00.000Z',
      checksum: 'b'.repeat(64),
      warningIntervalMin: 30,
    });
    const savedBackup = vi.spyOn(tournamentDatabase.backups, 'add').mockResolvedValue('backup');
    vi.spyOn(tournamentDatabase.backups, 'toArray').mockResolvedValue([]);
    vi.spyOn(tournamentDatabase.tournament, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.players, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.teams, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.stages, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.groups, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.matches, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.events, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.draws, 'clear').mockResolvedValue(undefined);
    const savedTournament = vi.spyOn(tournamentDatabase.tournament, 'put').mockResolvedValue('t');
    vi.spyOn(tournamentDatabase.players, 'bulkPut').mockResolvedValue('players');
    vi.spyOn(tournamentDatabase.teams, 'bulkPut').mockResolvedValue('teams');
    vi.spyOn(tournamentDatabase.stages, 'bulkPut').mockResolvedValue('stages');
    vi.spyOn(tournamentDatabase.groups, 'bulkPut').mockResolvedValue('groups');
    vi.spyOn(tournamentDatabase.matches, 'bulkPut').mockResolvedValue('matches');
    vi.spyOn(tournamentDatabase.events, 'bulkPut').mockResolvedValue('events');
    vi.spyOn(tournamentDatabase.draws, 'bulkPut').mockResolvedValue('draws');
    const savedProjectorState = vi
      .spyOn(tournamentDatabase.projectorState, 'put')
      .mockResolvedValue('current');
    const savedFileState = vi
      .spyOn(tournamentDatabase.tournamentFileState, 'put')
      .mockResolvedValue('current');

    await repository.loadTournamentFile(file);

    expect(savedBackup).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'BEFORE_LOAD_FILE', snapshot: currentSnapshot }),
    );
    expect(savedTournament).toHaveBeenCalledWith(importedSnapshot.tournament);
    expect(savedProjectorState).toHaveBeenCalledWith({
      id: 'current',
      forcedView: null,
      message: null,
      timer: null,
    });
    expect(savedFileState).toHaveBeenCalledWith(
      expect.objectContaining({
        tournamentId: 'imported',
        exportedAt: file.exportedAt,
        checksum: file.checksum,
      }),
    );
    expect(tournamentDatabase.transaction).toHaveBeenCalledWith(
      'rw',
      expect.arrayContaining(['backups', 'projectorState', 'tournamentFileState']),
      expect.any(Function),
    );
  });

  it('announces quota exhaustion and rethrows the backup error', async () => {
    const quotaError = new DOMException('Quota exceeded', 'QuotaExceededError');
    vi.spyOn(tournamentDatabase.backups, 'add').mockRejectedValue(quotaError);
    const warning = vi.fn();
    const subscription = backupQuotaExceeded.subscribe(warning);

    await expect(
      new TournamentRepository().createBackup('PERIODIC', snapshot()),
    ).rejects.toMatchObject({ name: 'QuotaExceededError' });

    expect(warning).toHaveBeenCalledOnce();
    subscription.unsubscribe();
  });
});

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
    vi.spyOn(tournamentDatabase.projectorState, 'clear').mockResolvedValue(undefined);
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

describe('TournamentRepository.startTournament', () => {
  beforeEach(() => {
    vi.spyOn(tournamentDatabase, 'transaction').mockImplementation((_mode, ...arguments_) => {
      const operation = arguments_.find((argument) => typeof argument === 'function');
      if (typeof operation !== 'function') {
        return Dexie.Promise.reject(new Error('Transaction scope is missing'));
      }
      return Dexie.Promise.resolve(Reflect.apply(operation, undefined, []));
    });
    vi.spyOn(tournamentDatabase.players, 'toArray').mockResolvedValue([]);
    vi.spyOn(tournamentDatabase.teams, 'toArray').mockResolvedValue([
      team('fixture-match-home'),
      team('fixture-match-away'),
    ]);
    vi.spyOn(tournamentDatabase.stages, 'toArray').mockResolvedValue([]);
    vi.spyOn(tournamentDatabase.groups, 'toArray').mockResolvedValue([]);
    vi.spyOn(tournamentDatabase.matches, 'toArray').mockResolvedValue([match('fixture-match', 1)]);
    vi.spyOn(tournamentDatabase.events, 'toArray').mockResolvedValue([]);
    vi.spyOn(tournamentDatabase.draws, 'toArray').mockResolvedValue([]);
    vi.spyOn(tournamentDatabase.backups, 'add').mockResolvedValue('backup');
    vi.spyOn(tournamentDatabase.backups, 'count').mockResolvedValue(1);
    vi.spyOn(tournamentDatabase.backups, 'toArray').mockResolvedValue([]);
    vi.spyOn(tournamentDatabase.matches, 'update').mockResolvedValue(1);
    vi.spyOn(tournamentDatabase.tournament, 'update').mockResolvedValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('backs up the original snapshot and starts the tournament atomically', async () => {
    const repository = new TournamentRepository();
    const existing = tournament('FIXTURE_GENERATED');
    vi.spyOn(repository, 'getTournament').mockResolvedValue(existing);

    await repository.startTournament('2026-11-26T12:00:00.000Z');

    expect(tournamentDatabase.transaction).toHaveBeenCalledWith(
      'rw',
      expect.arrayContaining(['tournament', 'matches', 'backups', 'teams', 'events']),
      expect.any(Function),
    );
    expect(tournamentDatabase.backups.add).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'TOURNAMENT_START',
        snapshot: expect.objectContaining({ tournament: existing }),
      }),
    );
    expect(tournamentDatabase.matches.update).not.toHaveBeenCalled();
    expect(tournamentDatabase.tournament.update).toHaveBeenCalledWith('tournament', {
      status: 'RUNNING',
      updatedAt: '2026-11-26T12:00:00.000Z',
    });
  });

  it('rejects repeated starts once the tournament is running', async () => {
    const repository = new TournamentRepository();
    vi.spyOn(repository, 'getTournament').mockResolvedValue(tournament('RUNNING'));

    await expect(repository.startTournament('2026-11-26T12:00:00.000Z')).rejects.toThrow(
      'Tournament cannot be started',
    );

    expect(tournamentDatabase.backups.add).not.toHaveBeenCalled();
    expect(tournamentDatabase.tournament.update).not.toHaveBeenCalled();
  });

  it('rejects a generated tournament with an empty fixture', async () => {
    const repository = new TournamentRepository();
    vi.spyOn(repository, 'getTournament').mockResolvedValue(tournament('FIXTURE_GENERATED'));
    vi.spyOn(tournamentDatabase.matches, 'toArray').mockResolvedValue([]);

    await expect(repository.startTournament('2026-11-26T12:00:00.000Z')).rejects.toThrow(
      'Tournament fixture is empty',
    );
    expect(tournamentDatabase.backups.add).not.toHaveBeenCalled();
    expect(tournamentDatabase.tournament.update).not.toHaveBeenCalled();
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

    await repository.updateFormat(
      { format: 'KNOCKOUT', thirdPlaceMatch: false },
      { matchDurationMin: 35, restMin: 7 },
    );

    expect(tournamentDatabase.tournament.update).toHaveBeenCalledWith(
      'tournament',
      expect.objectContaining({
        formatParams: { format: 'KNOCKOUT', thirdPlaceMatch: false },
        schedule: {
          ...existing.schedule,
          matchDurationMin: 35,
          restMin: 7,
          breaks: [],
        },
      }),
    );
  });

  it('persists duration and rest changes without replacing other schedule settings', async () => {
    const repository = new TournamentRepository();
    const formatParams: FormatParams = { format: 'ROUND_ROBIN', rounds: 1 };
    const existing = {
      ...tournament(),
      formatParams,
      schedule: {
        startTime: '2026-11-25T10:00:00.000Z',
        matchDurationMin: 20,
        restMin: 5,
        breaks: [{ id: 'break', label: 'Pausa', durationMin: 30, beforeMatchId: 'match' }],
      },
    };
    vi.spyOn(repository, 'getTournament').mockResolvedValue(existing);

    await repository.updateFormat(formatParams, { matchDurationMin: 35, restMin: 7 });

    expect(tournamentDatabase.tournament.update).toHaveBeenCalledWith(
      'tournament',
      expect.objectContaining({
        formatParams,
        schedule: {
          ...existing.schedule,
          matchDurationMin: 35,
          restMin: 7,
        },
      }),
    );
  });
});

describe('TournamentRepository team withdrawal', () => {
  const changedAt = '2026-11-27T03:00:00.000Z';

  beforeEach(() => {
    vi.spyOn(tournamentDatabase, 'transaction').mockImplementation((_mode, ...arguments_) => {
      const operation = arguments_.find((argument) => typeof argument === 'function');
      if (typeof operation !== 'function') {
        return Dexie.Promise.reject(new Error('Transaction scope is missing'));
      }
      return Dexie.Promise.resolve(Reflect.apply(operation, undefined, []));
    });
    vi.spyOn(tournamentDatabase.players, 'toArray').mockResolvedValue([]);
    vi.spyOn(tournamentDatabase.teams, 'toArray').mockResolvedValue([
      team('retiring'),
      team('opponent'),
    ]);
    vi.spyOn(tournamentDatabase.stages, 'toArray').mockResolvedValue([]);
    vi.spyOn(tournamentDatabase.groups, 'toArray').mockResolvedValue([]);
    vi.spyOn(tournamentDatabase.matches, 'toArray').mockResolvedValue([
      {
        ...match('withdrawal-match', 1),
        home: { kind: 'TEAM', teamId: 'opponent' },
        away: { kind: 'TEAM', teamId: 'retiring' },
      },
    ]);
    vi.spyOn(tournamentDatabase.events, 'toArray').mockResolvedValue([]);
    vi.spyOn(tournamentDatabase.draws, 'toArray').mockResolvedValue([]);
    vi.spyOn(tournamentDatabase.backups, 'add').mockResolvedValue('backup');
    vi.spyOn(tournamentDatabase.backups, 'count').mockResolvedValue(1);
    vi.spyOn(tournamentDatabase.backups, 'toArray').mockResolvedValue([]);
    vi.spyOn(tournamentDatabase.teams, 'put').mockResolvedValue('retiring');
    vi.spyOn(tournamentDatabase.matches, 'bulkPut').mockResolvedValue('withdrawal-match');
    vi.spyOn(tournamentDatabase.tournament, 'update').mockResolvedValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('backs up and writes withdrawal results in one Dexie transaction', async () => {
    const repository = new TournamentRepository();
    const existing = tournament('RUNNING');
    vi.spyOn(repository, 'getTournament').mockResolvedValue(existing);

    await repository.withdrawTeam('retiring', changedAt);

    expect(tournamentDatabase.transaction).toHaveBeenCalledWith(
      'rw',
      expect.arrayContaining(['teams', 'matches', 'backups', 'events', 'tournament']),
      expect.any(Function),
    );
    expect(tournamentDatabase.backups.add).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'BEFORE_CASCADE_EDIT',
        snapshot: expect.objectContaining({
          tournament: existing,
          teams: expect.arrayContaining([
            expect.objectContaining({ id: 'retiring', status: 'ACTIVE' }),
          ]),
          matches: expect.arrayContaining([
            expect.objectContaining({ id: 'withdrawal-match', status: 'PENDING' }),
          ]),
        }),
      }),
    );
    expect(tournamentDatabase.teams.put).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'retiring', status: 'WITHDRAWN' }),
    );
    expect(tournamentDatabase.matches.bulkPut).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'withdrawal-match',
        result: expect.objectContaining({
          mode: 'WALKOVER',
          homePoints: 28,
          awayPoints: 0,
          walkoverOrigin: { kind: 'TEAM_WITHDRAWAL', teamId: 'retiring' },
        }),
      }),
    ]);
    expect(tournamentDatabase.tournament.update).toHaveBeenCalledWith('tournament', {
      updatedAt: changedAt,
    });
  });
});

describe('TournamentRepository tournament reset actions', () => {
  const teamDraw: Draw = {
    id: 'team-draw',
    seed: 'team-seed',
    createdAt: '2026-11-25T00:00:00.000Z',
    payload: { kind: 'TEAMS', teams: [] },
  };
  const groupDraw: Draw = {
    id: 'group-draw',
    seed: 'group-seed',
    createdAt: '2026-11-25T00:00:00.000Z',
    payload: { kind: 'GROUPS', groups: [] },
  };

  beforeEach(() => {
    vi.spyOn(tournamentDatabase, 'transaction').mockImplementation((_mode, ...arguments_) => {
      const operation = arguments_.find((argument) => typeof argument === 'function');
      if (typeof operation !== 'function') {
        return Dexie.Promise.reject(new Error('Transaction scope is missing'));
      }
      return Dexie.Promise.resolve(Reflect.apply(operation, undefined, []));
    });
    vi.spyOn(tournamentDatabase.players, 'toArray').mockResolvedValue([]);
    vi.spyOn(tournamentDatabase.teams, 'toArray').mockResolvedValue([
      team('withdrawn', 'WITHDRAWN'),
      team('active'),
    ]);
    vi.spyOn(tournamentDatabase.stages, 'toArray').mockResolvedValue([]);
    vi.spyOn(tournamentDatabase.groups, 'toArray').mockResolvedValue([]);
    vi.spyOn(tournamentDatabase.matches, 'toArray').mockResolvedValue([]);
    vi.spyOn(tournamentDatabase.events, 'toArray').mockResolvedValue([]);
    vi.spyOn(tournamentDatabase.draws, 'toArray').mockResolvedValue([teamDraw, groupDraw]);
    vi.spyOn(tournamentDatabase.tournament, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.players, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.teams, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.stages, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.groups, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.matches, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.events, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.draws, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.projectorState, 'clear').mockResolvedValue(undefined);
    vi.spyOn(tournamentDatabase.teams, 'bulkPut').mockResolvedValue('active');
    vi.spyOn(tournamentDatabase.draws, 'bulkPut').mockResolvedValue('team-draw');
    vi.spyOn(tournamentDatabase.tournament, 'update').mockResolvedValue(1);
    vi.spyOn(tournamentDatabase.backups, 'add').mockResolvedValue('backup');
    vi.spyOn(tournamentDatabase.backups, 'count').mockResolvedValue(1);
    vi.spyOn(tournamentDatabase.backups, 'toArray').mockResolvedValue([]);
    vi.spyOn(tournamentDatabase.backups, 'clear').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('backs up and removes tournament data atomically while retaining automatic backups', async () => {
    const repository = new TournamentRepository();
    vi.spyOn(repository, 'getTournament').mockResolvedValue(tournament('RUNNING'));

    await repository.deleteTournamentWithBackup();

    expect(tournamentDatabase.transaction).toHaveBeenCalledWith(
      'rw',
      expect.arrayContaining([
        'tournament',
        'players',
        'teams',
        'stages',
        'groups',
        'matches',
        'events',
        'draws',
        'backups',
      ]),
      expect.any(Function),
    );
    expect(tournamentDatabase.backups.add).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'BEFORE_RESET',
        snapshot: expect.objectContaining({ tournament: tournament('RUNNING') }),
      }),
    );
    expect(tournamentDatabase.tournament.clear).toHaveBeenCalled();
    expect(tournamentDatabase.players.clear).toHaveBeenCalled();
    expect(tournamentDatabase.teams.clear).toHaveBeenCalled();
    expect(tournamentDatabase.stages.clear).toHaveBeenCalled();
    expect(tournamentDatabase.groups.clear).toHaveBeenCalled();
    expect(tournamentDatabase.matches.clear).toHaveBeenCalled();
    expect(tournamentDatabase.events.clear).toHaveBeenCalled();
    expect(tournamentDatabase.draws.clear).toHaveBeenCalled();
    expect(tournamentDatabase.backups.clear).not.toHaveBeenCalled();
  });

  it('backs up and resets a running fixture while retaining teams and team draws', async () => {
    const repository = new TournamentRepository();
    vi.spyOn(repository, 'getTournament').mockResolvedValue(tournament('RUNNING'));

    await repository.resetFixture('2026-11-26T12:00:00.000Z');

    expect(tournamentDatabase.transaction).toHaveBeenCalledWith(
      'rw',
      expect.arrayContaining([
        'tournament',
        'players',
        'teams',
        'stages',
        'groups',
        'matches',
        'events',
        'draws',
        'backups',
      ]),
      expect.any(Function),
    );
    expect(tournamentDatabase.backups.add).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'BEFORE_RESET' }),
    );
    expect(tournamentDatabase.stages.clear).toHaveBeenCalled();
    expect(tournamentDatabase.groups.clear).toHaveBeenCalled();
    expect(tournamentDatabase.matches.clear).toHaveBeenCalled();
    expect(tournamentDatabase.events.clear).toHaveBeenCalled();
    expect(tournamentDatabase.teams.bulkPut).toHaveBeenCalledWith([
      team('withdrawn', 'ACTIVE'),
      team('active', 'ACTIVE'),
    ]);
    expect(tournamentDatabase.draws.clear).toHaveBeenCalled();
    expect(tournamentDatabase.draws.bulkPut).toHaveBeenCalledWith([teamDraw]);
    expect(tournamentDatabase.tournament.update).toHaveBeenCalledWith(
      'tournament',
      expect.objectContaining({
        status: 'SETUP',
        schedule: { ...tournament('RUNNING').schedule, breaks: [] },
        updatedAt: '2026-11-26T12:00:00.000Z',
      }),
    );
  });

  it('rejects fixture reset unless the tournament is running', async () => {
    const repository = new TournamentRepository();
    vi.spyOn(repository, 'getTournament').mockResolvedValue(tournament('SETUP'));

    await expect(repository.resetFixture('2026-11-26T12:00:00.000Z')).rejects.toThrow(
      'Fixture can only be reset while the tournament is running',
    );

    expect(tournamentDatabase.backups.add).not.toHaveBeenCalled();
    expect(tournamentDatabase.matches.clear).not.toHaveBeenCalled();
    expect(tournamentDatabase.teams.bulkPut).not.toHaveBeenCalled();
  });
});

describe('TournamentRepository projector state', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the default state when no state is stored', async () => {
    vi.spyOn(tournamentDatabase.projectorState, 'get').mockResolvedValue(undefined);

    await expect(new TournamentRepository().getProjectorState()).resolves.toEqual({
      forcedView: null,
      message: null,
      timer: null,
    });
  });

  it('stores the current projector state atomically', async () => {
    let storedState: ({ readonly id: 'current' } & ProjectorState) | undefined;
    vi.spyOn(tournamentDatabase, 'transaction').mockImplementation((_mode, ...arguments_) => {
      const operation = arguments_.find((argument) => typeof argument === 'function');
      if (typeof operation !== 'function') {
        return Dexie.Promise.reject(new Error('Transaction scope is missing'));
      }
      return Dexie.Promise.resolve(Reflect.apply(operation, undefined, []));
    });
    vi.spyOn(tournamentDatabase.projectorState, 'get').mockImplementation(() =>
      Dexie.Promise.resolve(storedState),
    );
    vi.spyOn(tournamentDatabase.projectorState, 'put').mockImplementation((record) => {
      storedState = record;
      return Dexie.Promise.resolve('current');
    });
    const state: ProjectorState = {
      forcedView: { kind: 'STANDINGS', groupId: 'group-1' },
      message: { text: 'Almuerzo hasta las 14:00', mode: 'BANNER' as const },
      timer: { name: 'Almuerzo', endsAtEpochMs: 1799999999 },
    };

    await new TournamentRepository().saveProjectorState(state);

    expect(tournamentDatabase.transaction).toHaveBeenCalledWith(
      'rw',
      tournamentDatabase.projectorState,
      expect.any(Function),
    );
    expect(tournamentDatabase.projectorState.put).toHaveBeenCalledWith({
      id: 'current',
      ...state,
    });
    await expect(new TournamentRepository().getProjectorState()).resolves.toMatchObject(state);
  });
});
