import {
  Backup,
  BackupReason,
  Draw,
  Match,
  MatchEvent,
  Player,
  Team,
  Tournament,
  TournamentSnapshot,
} from '../domain/model';
import { TOURNAMENT_SCHEMA_VERSION, tournamentDatabase } from './tournament-database';

export interface MatchSaveInput {
  readonly match: Match;
  readonly events: readonly MatchEvent[];
}

export class TournamentRepository {
  async open(): Promise<void> {
    await tournamentDatabase.open();
  }

  async isAvailable(): Promise<boolean> {
    try {
      await tournamentDatabase.open();
      await tournamentDatabase.tournament.count();
      return true;
    } catch {
      await tournamentDatabase.close();
      return false;
    }
  }

  async getTournament(): Promise<Tournament | null> {
    return (await tournamentDatabase.tournament.toCollection().first()) ?? null;
  }

  async createTournament(tournament: Tournament): Promise<void> {
    await tournamentDatabase.transaction('rw', tournamentDatabase.tournament, async () => {
      await tournamentDatabase.tournament.clear();
      await tournamentDatabase.tournament.put({
        ...tournament,
        schemaVersion: TOURNAMENT_SCHEMA_VERSION,
      });
    });
  }

  async saveMatchWithEvents(input: MatchSaveInput): Promise<void> {
    await tournamentDatabase.transaction(
      'rw',
      tournamentDatabase.matches,
      tournamentDatabase.events,
      tournamentDatabase.tournament,
      async () => {
        await tournamentDatabase.matches.put(input.match);
        await tournamentDatabase.events.where('matchId').equals(input.match.id).delete();
        await tournamentDatabase.events.bulkPut([...input.events]);

        const tournament = await this.getTournament();
        if (tournament) {
          await tournamentDatabase.tournament.update(tournament.id, {
            updatedAt: new Date().toISOString(),
          });
        }
      },
    );
  }

  async touchTournament(): Promise<void> {
    await tournamentDatabase.transaction('rw', tournamentDatabase.tournament, async () => {
      const tournament = await this.getTournament();
      if (tournament) {
        await tournamentDatabase.tournament.update(tournament.id, {
          updatedAt: new Date().toISOString(),
        });
      }
    });
  }

  async createBackup(reason: BackupReason, snapshot: TournamentSnapshot): Promise<Backup> {
    const backup: Backup = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      reason,
      snapshot,
    };
    await tournamentDatabase.transaction('rw', tournamentDatabase.backups, async () => {
      await tournamentDatabase.backups.add(backup);
      const oldIds = await tournamentDatabase.backups
        .orderBy('createdAt')
        .reverse()
        .offset(10)
        .primaryKeys();
      if (oldIds.length > 0) {
        await tournamentDatabase.backups.bulkDelete(oldIds);
      }
    });
    return backup;
  }

  async saveDraw(draw: Draw): Promise<void> {
    await tournamentDatabase.transaction('rw', tournamentDatabase.draws, async () => {
      await tournamentDatabase.draws.put(draw);
    });
  }

  async getPlayers(): Promise<readonly Player[]> {
    const players = await tournamentDatabase.players.toArray();
    return players.sort((left, right) =>
      `${left.lastName} ${left.firstName}`.localeCompare(
        `${right.lastName} ${right.firstName}`,
        'es',
      ),
    );
  }

  async getTeams(): Promise<readonly Team[]> {
    return tournamentDatabase.teams.orderBy('name').sortBy('name');
  }

  async putPlayer(player: Player, previousTeamId: string | null = null): Promise<void> {
    await tournamentDatabase.transaction(
      'rw',
      tournamentDatabase.players,
      tournamentDatabase.teams,
      async () => {
        await tournamentDatabase.players.put(player);

        if (previousTeamId && previousTeamId !== player.teamId) {
          const previousTeam = await tournamentDatabase.teams.get(previousTeamId);
          if (previousTeam?.captainId === player.id) {
            await tournamentDatabase.teams.update(previousTeam.id, { captainId: null });
          }
        }
      },
    );
  }

  async deletePlayer(playerId: string): Promise<boolean> {
    return tournamentDatabase.transaction(
      'rw',
      tournamentDatabase.players,
      tournamentDatabase.teams,
      tournamentDatabase.events,
      tournamentDatabase.tournament,
      async () => {
        const player = await tournamentDatabase.players.get(playerId);
        if (!player) {
          return false;
        }

        let captainCleared = false;
        const teams = await tournamentDatabase.teams
          .filter((team) => team.captainId === playerId)
          .toArray();
        if (teams.length > 0) {
          await tournamentDatabase.teams.bulkUpdate(
            teams.map((team) => ({
              key: team.id,
              changes: { captainId: null },
            })),
          );
          captainCleared = true;
        }

        await tournamentDatabase.events
          .where('playerId')
          .equals(playerId)
          .modify({ playerId: null });
        await tournamentDatabase.players.delete(playerId);
        const tournament = await this.getTournament();
        if (tournament) {
          await tournamentDatabase.tournament.update(tournament.id, {
            updatedAt: new Date().toISOString(),
          });
        }
        return captainCleared;
      },
    );
  }
}

export const tournamentRepository = new TournamentRepository();
