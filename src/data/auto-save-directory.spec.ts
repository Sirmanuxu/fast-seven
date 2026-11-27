import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tournamentRepository } from './tournament-repository';
import { AutoSaveDirectoryHandle, tournamentDatabase } from './tournament-database';
import { saveSnapshotToAutoSaveDirectory } from './auto-save-directory';
import { TournamentSnapshot } from '../domain/model';

function snapshot(): TournamentSnapshot {
  const timestamp = '2026-11-25T00:00:00.000Z';
  return {
    tournament: {
      id: 'tournament',
      name: 'Club Ñandú',
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

function directoryHandle(
  getFileHandle: AutoSaveDirectoryHandle['getFileHandle'],
): AutoSaveDirectoryHandle {
  return {
    kind: 'directory',
    name: 'backups',
    isSameEntry: vi.fn(),
    queryPermission: vi.fn().mockResolvedValue('granted'),
    requestPermission: vi.fn().mockResolvedValue('granted'),
    getFileHandle,
  } as unknown as AutoSaveDirectoryHandle;
}

describe('auto-save directory', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('writes a versioned checksum file and records its successful export', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const createWritable = vi.fn().mockResolvedValue({ write, close });
    const getFileHandle = vi.fn().mockResolvedValue({ createWritable });
    const handle = directoryHandle(getFileHandle);
    const recordExport = vi
      .spyOn(tournamentRepository, 'recordTournamentFileExport')
      .mockResolvedValue(undefined);

    await expect(saveSnapshotToAutoSaveDirectory(snapshot(), '0.51.0', handle)).resolves.toBe(
      'SAVED',
    );

    expect(getFileHandle).toHaveBeenCalledWith('torneo-club-nandu-autoguardado.json', {
      create: true,
    });
    const savedFile = JSON.parse(write.mock.calls[0][0] as string) as {
      readonly appVersion: string;
      readonly checksum: string;
    };
    expect(savedFile.appVersion).toBe('0.51.0');
    expect(savedFile.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(recordExport).toHaveBeenCalledWith('tournament', expect.any(String), savedFile.checksum);
  });

  it('does not record a save when writing the file fails', async () => {
    const write = vi.fn().mockRejectedValue(new Error('disk full'));
    const abort = vi.fn().mockResolvedValue(undefined);
    const createWritable = vi.fn().mockResolvedValue({ write, close: vi.fn(), abort });
    const handle = directoryHandle(vi.fn().mockResolvedValue({ createWritable }));
    const recordExport = vi.spyOn(tournamentRepository, 'recordTournamentFileExport');

    await expect(saveSnapshotToAutoSaveDirectory(snapshot(), '0.51.0', handle)).rejects.toThrow(
      'disk full',
    );

    expect(abort).toHaveBeenCalledOnce();
    expect(recordExport).not.toHaveBeenCalled();
  });

  it('returns permission-required without touching the file', async () => {
    const getFileHandle = vi.fn();
    const handle = directoryHandle(getFileHandle);
    vi.mocked(handle.queryPermission).mockResolvedValue('prompt');

    await expect(saveSnapshotToAutoSaveDirectory(snapshot(), '0.51.0', handle)).resolves.toBe(
      'PERMISSION_REQUIRED',
    );
    expect(getFileHandle).not.toHaveBeenCalled();
  });

  it('saves directory handles in IndexedDB when selected', async () => {
    const handle = directoryHandle(vi.fn());
    const put = vi.spyOn(tournamentDatabase.autoSaveDirectory, 'put').mockResolvedValue('current');
    vi.spyOn(tournamentDatabase, 'transaction').mockImplementation((_mode, ...arguments_) => {
      const operation = arguments_.find((argument) => typeof argument === 'function');
      if (typeof operation !== 'function') {
        return Dexie.Promise.reject(new Error('Transaction scope is missing'));
      }
      return Dexie.Promise.resolve(Reflect.apply(operation, undefined, []));
    });

    vi.stubGlobal('window', {
      showDirectoryPicker: vi.fn().mockResolvedValue(handle),
    });

    const { chooseAutoSaveDirectory } = await import('./auto-save-directory');
    await expect(chooseAutoSaveDirectory()).resolves.toBe(handle);
    expect(put).toHaveBeenCalledWith({ id: 'current', handle });
  });
});
