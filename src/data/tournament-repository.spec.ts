import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Match } from '../domain/model';
import { TournamentRepository } from './tournament-repository';
import { tournamentDatabase } from './tournament-database';

function match(
  id: string,
  order: number,
  status: Match['status'] = 'PENDING',
): Match {
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

describe('TournamentRepository.updateMatchOrders', () => {
  beforeEach(() => {
    vi.spyOn(tournamentDatabase, 'transaction').mockImplementation(
      (_mode, ...arguments_) => {
        const operation = arguments_.find((argument) => typeof argument === 'function');
        if (typeof operation !== 'function') {
          return Dexie.Promise.reject(new Error('Transaction scope is missing'));
        }
        return Dexie.Promise.resolve(Reflect.apply(operation, undefined, []));
      },
    );
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

    await expect(
      repository.updateMatchOrders([{ matchId: 'finished', order: 2 }]),
    ).rejects.toThrow('is no longer reorderable');
    expect(tournamentDatabase.matches.bulkUpdate).not.toHaveBeenCalled();
  });

  it('rejects duplicate positions instead of persisting an invalid fixture order', async () => {
    const repository = new TournamentRepository();

    await expect(
      repository.updateMatchOrders([{ matchId: 'one', order: 2 }]),
    ).rejects.toThrow('duplicate positions');
    expect(tournamentDatabase.matches.bulkUpdate).not.toHaveBeenCalled();
  });
});
