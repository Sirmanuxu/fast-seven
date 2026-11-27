import Dexie, { Table } from 'dexie';
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

  constructor() {
    super('fast-seven');
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
  }
}

export const tournamentDatabase = new TournamentDatabase();
