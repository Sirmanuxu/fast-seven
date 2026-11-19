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
} from '../domain/model';

export const TOURNAMENT_SCHEMA_VERSION = 1;

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

  constructor() {
    super('fast-seven');
    this.version(TOURNAMENT_SCHEMA_VERSION).stores({
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
  }
}

export const tournamentDatabase = new TournamentDatabase();
