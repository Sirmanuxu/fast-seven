import Dexie, { Table } from 'dexie';
import {
  DatabaseWriteBlockedError,
  databaseWriteFailed,
  databaseWriteSucceeded,
  isDatabaseWriteAllowed,
} from './database-write-gate';
import {
  Backup,
  Draw,
  Group,
  Match,
  MatchEvent,
  Player,
  Stage,
  Team,
  Tournament,
  ProjectorState,
} from '../domain/model';

export interface StoredProjectorState extends ProjectorState {
  readonly id: 'current';
}

export interface StoredTournamentFileState {
  readonly id: 'current';
  readonly tournamentId: string | null;
  readonly exportedAt: string | null;
  readonly checksum: string | null;
  readonly warningIntervalMin: number;
}

export interface AutoSaveDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission(descriptor: { readonly mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(descriptor: { readonly mode: 'readwrite' }): Promise<PermissionState>;
}

export interface StoredAutoSaveDirectory {
  readonly id: 'current';
  readonly handle: AutoSaveDirectoryHandle;
}

export interface StoredPanelSession {
  readonly id: 'current';
  readonly cleanShutdown: boolean;
  readonly startedAt: string;
  readonly lastSavedAt: string | null;
}

export const TOURNAMENT_SCHEMA_VERSION = 2;

export class TournamentDatabase extends Dexie {
  tournament!: Table<Tournament, string>;
  players!: Table<Player, string>;
  teams!: Table<Team, string>;
  stages!: Table<Stage, string>;
  groups!: Table<Group, string>;
  matches!: Table<Match, string>;
  events!: Table<MatchEvent, string>;
  draws!: Table<Draw, string>;
  backups!: Table<Backup, string>;
  projectorState!: Table<StoredProjectorState, 'current'>;
  tournamentFileState!: Table<StoredTournamentFileState, 'current'>;
  autoSaveDirectory!: Table<StoredAutoSaveDirectory, 'current'>;
  panelSession!: Table<StoredPanelSession, 'current'>;

  constructor() {
    super('fast-seven');
    this.use({
      stack: 'dbcore',
      create: (downlevel) => ({
        ...downlevel,
        table: (name) => {
          const table = downlevel.table(name);
          return {
            ...table,
            mutate: async (request) => {
              if (name !== 'panelSession' && !isDatabaseWriteAllowed()) {
                throw new DatabaseWriteBlockedError();
              }
              try {
                const result = await table.mutate(request);
                if (name !== 'panelSession') {
                  if (result.numFailures > 0) databaseWriteFailed.next();
                  const transaction = Dexie.currentTransaction;
                  if (transaction) {
                    transaction.on('complete', () => databaseWriteSucceeded.next());
                    transaction.on('abort', () => databaseWriteFailed.next());
                  } else {
                    databaseWriteSucceeded.next();
                  }
                }
                return result;
              } catch (error) {
                if (!(error instanceof DatabaseWriteBlockedError)) databaseWriteFailed.next();
                throw error;
              }
            },
          };
        },
      }),
    });
    this.version(1).stores({
      tournament: 'id, status, updatedAt',
      players: 'id, teamId, category, normalizedKey',
      teams: 'id, name, status',
      stages: 'id, order',
      groups: 'id, stageId',
      matches: 'id, stageId, groupId, status, order',
      events: 'id, matchId, teamId, playerId, createdAt',
      draws: 'id, createdAt',
      backups: 'id, createdAt, reason',
    });
    this.version(2).stores({
      projectorState: 'id',
    });
    this.version(3).stores({
      tournamentFileState: 'id',
    });
    this.version(4).stores({
      autoSaveDirectory: 'id',
    });
    this.version(5).stores({
      panelSession: 'id',
    });
  }
}

export const tournamentDatabase = new TournamentDatabase();
