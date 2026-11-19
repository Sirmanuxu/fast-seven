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
import { canCreateOrDeleteTeam } from '../domain/team';

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
    const teams = await tournamentDatabase.teams.toArray();
    return teams.sort((left, right) => left.name.localeCompare(right.name, 'es'));
  }

  async putTeam(team: Team): Promise<void> {
    await tournamentDatabase.transaction(
      'rw',
      tournamentDatabase.teams,
      tournamentDatabase.tournament,
      async () => {
        const tournament = await this.getTournament();
        const existing = await tournamentDatabase.teams.get(team.id);
        if (tournament?.status === 'RUNNING' && !existing) {
          throw new Error('Teams cannot be created while the tournament is running');
        }
        await tournamentDatabase.teams.put(team);
        if (tournament) {
          await tournamentDatabase.tournament.update(tournament.id, {
            updatedAt: new Date().toISOString(),
          });
        }
      },
    );
  }

  async deleteTeam(teamId: string): Promise<void> {
    await tournamentDatabase.transaction(
      'rw',
      tournamentDatabase.teams,
      tournamentDatabase.players,
      tournamentDatabase.backups,
      tournamentDatabase.tournament,
      async () => {
        const [tournament, players, teams, stages, groups, matches, events, draws] =
          await Promise.all([
            tournamentDatabase.tournament.toCollection().first(),
            tournamentDatabase.players.toArray(),
            tournamentDatabase.teams.toArray(),
            tournamentDatabase.stages.toArray(),
            tournamentDatabase.groups.toArray(),
            tournamentDatabase.matches.toArray(),
            tournamentDatabase.events.toArray(),
            tournamentDatabase.draws.toArray(),
          ]);

        if (!tournament) {
          throw new Error('No tournament is available');
        }
        if (!canCreateOrDeleteTeam(tournament.status)) {
          throw new Error('Teams cannot be deleted while the tournament is running');
        }

        const backup: Backup = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          reason: 'BEFORE_CASCADE_EDIT',
          snapshot: {
            tournament,
            players,
            teams,
            stages,
            groups,
            matches,
            events,
            draws,
          },
        };
        await tournamentDatabase.backups.add(backup);

        await tournamentDatabase.players.where('teamId').equals(teamId).modify({ teamId: null });
        await tournamentDatabase.teams.delete(teamId);
        await tournamentDatabase.tournament.update(tournament.id, {
          updatedAt: new Date().toISOString(),
        });

        const oldIds = await tournamentDatabase.backups
          .orderBy('createdAt')
          .reverse()
          .offset(10)
          .primaryKeys();
        if (oldIds.length > 0) {
          await tournamentDatabase.backups.bulkDelete(oldIds);
        }
      },
    );
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
