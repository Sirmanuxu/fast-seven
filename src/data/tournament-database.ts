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
  }
}

export const tournamentDatabase = new TournamentDatabase();
