import {
  Backup,
  BackupReason,
  Category,
  CategoryStage,
  Draw,
  Gender,
  Match,
  MatchEvent,
  Player,
  Team,
  Tournament,
  TournamentSnapshot,
} from '../domain/model';
import { TOURNAMENT_SCHEMA_VERSION, tournamentDatabase } from './tournament-database';
import { canCreateOrDeleteTeam, normalizeTeamName } from '../domain/team';
import { normalizePlayerKey } from '../domain/player';

export interface MatchSaveInput {
  readonly match: Match;
  readonly events: readonly MatchEvent[];
}

export interface ConfirmImportTeamResolution {
  readonly incomingName: string;
  readonly existingTeamId: string | null;
  readonly action: 'CREATE' | 'MERGE';
}

export interface ConfirmImportPlayerRow {
  readonly rowNumber: number;
  readonly firstName: string;
  readonly lastName: string;
  readonly normalizedCategory: string | null;
  readonly normalizedGender: Gender | null;
  readonly normalizedTeamName: string | null;
  readonly status: 'OK' | 'WARNING' | 'ERROR';
  readonly discarded: boolean;
  readonly duplicateExisting: boolean;
  readonly duplicateInFile: boolean;
  readonly differentPerson: boolean;
}

export interface ConfirmImportSummary {
  readonly createdPlayers: number;
  readonly skippedPlayers: number;
  readonly createdTeams: number;
  readonly teamNames: readonly string[];
  readonly underMinimumTeams: readonly string[];
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

  async assignPlayers(
    playerIds: readonly string[],
    destinationTeamId: string | null,
  ): Promise<readonly string[]> {
    if (playerIds.length === 0) {
      return [];
    }

    return tournamentDatabase.transaction(
      'rw',
      tournamentDatabase.players,
      tournamentDatabase.teams,
      tournamentDatabase.tournament,
      async () => {
        const selected = new Set(playerIds);
        const players = await tournamentDatabase.players.where('id').anyOf(playerIds).toArray();
        const teams = await tournamentDatabase.teams.toArray();
        const captainClearedTeamIds: string[] = [];

        for (const team of teams) {
          if (
            team.captainId &&
            selected.has(team.captainId) &&
            players.find((player) => player.id === team.captainId)?.teamId !== destinationTeamId
          ) {
            captainClearedTeamIds.push(team.id);
          }
        }

        await tournamentDatabase.players
          .where('id')
          .anyOf(playerIds)
          .modify({ teamId: destinationTeamId });

        if (captainClearedTeamIds.length > 0) {
          await tournamentDatabase.teams.bulkUpdate(
            captainClearedTeamIds.map((teamId) => ({
              key: teamId,
              changes: { captainId: null },
            })),
          );
        }

        const tournament = await this.getTournament();
        if (tournament) {
          await tournamentDatabase.tournament.update(tournament.id, {
            updatedAt: new Date().toISOString(),
          });
        }

        return captainClearedTeamIds;
      },
    );
  }

  async addTournamentCategory(rawLabel: string): Promise<Category> {
    const label = rawLabel.trim().replace(/\s+/g, ' ');
    if (!label) {
      throw new Error('Category label is required');
    }
    const code = label
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleUpperCase('es')
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!code) {
      throw new Error('Category code is invalid');
    }

    const numeric = /^M(7|8|9|10|11|12|13|14|15|16|17|18|19)$/.exec(code);
    const stage: CategoryStage = numeric
      ? Number.parseInt(code.slice(1), 10) <= 12
        ? 'INFANT'
        : 'YOUTH'
      : 'ADULT';

    const category: Category = {
      code,
      label,
      stage,
      aliases: [label.toLocaleLowerCase('es')],
    };

    await tournamentDatabase.transaction('rw', tournamentDatabase.tournament, async () => {
      const tournament = await this.getTournament();
      if (!tournament) {
        throw new Error('No tournament is available');
      }
      if (tournament.categories.some((item) => item.code === code)) {
        return;
      }
      await tournamentDatabase.tournament.update(tournament.id, {
        categories: [...tournament.categories, category],
        updatedAt: new Date().toISOString(),
      });
    });
    return category;
  }

  async confirmImport(
    rows: readonly ConfirmImportPlayerRow[],
    teamResolutions: readonly ConfirmImportTeamResolution[],
    duplicateActions: Readonly<Record<number, 'SKIP' | 'UPDATE_TEAM' | 'DISTINCT'>>,
  ): Promise<ConfirmImportSummary> {
    return tournamentDatabase.transaction(
      'rw',
      [
        'teams',
        'players',
        'stages',
        'groups',
        'matches',
        'events',
        'draws',
        'backups',
        'tournament',
      ],
      async () => {
        const [tournament, existingPlayers, existingTeams, stages, groups, matches, events, draws] =
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

        const snapshot: TournamentSnapshot = {
          tournament,
          players: existingPlayers,
          teams: existingTeams,
          stages,
          groups,
          matches,
          events,
          draws,
        };
        await tournamentDatabase.backups.add({
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          reason: 'BEFORE_IMPORT',
          snapshot,
        });

        const teamIds = new Map<string, string>();
        for (const resolution of teamResolutions) {
          if (resolution.existingTeamId) {
            teamIds.set(normalizeTeamName(resolution.incomingName), resolution.existingTeamId);
            continue;
          }
          if (tournament.status === 'RUNNING') continue;
          if (resolution.action !== 'CREATE') continue;

          const teamId = crypto.randomUUID();
          const team: Team = {
            id: teamId,
            name: resolution.incomingName,
            primaryColor: '#1f4b99',
            secondaryColor: '#f1c40f',
            captainId: null,
            logo: null,
            isSeed: false,
            status: 'ACTIVE',
          };
          await tournamentDatabase.teams.add(team);
          teamIds.set(normalizeTeamName(resolution.incomingName), teamId);
        }

        let createdPlayers = 0;
        let skippedPlayers = 0;
        const allExistingNow = await tournamentDatabase.players.toArray();

        for (const row of rows) {
          if (row.discarded || row.status === 'ERROR') {
            skippedPlayers += 1;
            continue;
          }
          if (!row.firstName || !row.lastName || !row.normalizedCategory || !row.normalizedGender) {
            skippedPlayers += 1;
            continue;
          }

          const normalizedKey = normalizePlayerKey(
            row.firstName,
            row.lastName,
            row.normalizedCategory,
          );
          const existingDuplicate = allExistingNow.find(
            (player) => player.normalizedKey === normalizedKey && player.disambiguation === null,
          );
          const duplicateAction =
            duplicateActions[row.rowNumber] ??
            (row.duplicateExisting || row.duplicateInFile ? 'SKIP' : 'SKIP');

          if (existingDuplicate && duplicateAction === 'SKIP' && !row.differentPerson) {
            skippedPlayers += 1;
            continue;
          }
          if (existingDuplicate && duplicateAction === 'UPDATE_TEAM') {
            const teamId = row.normalizedTeamName
              ? (teamIds.get(normalizeTeamName(row.normalizedTeamName)) ?? null)
              : null;
            await tournamentDatabase.players.update(existingDuplicate.id, {
              teamId,
            });
            continue;
          }

          let disambiguation: string | null = null;
          if (row.differentPerson || duplicateAction === 'DISTINCT' || row.duplicateInFile) {
            const sameKeyPlayers = allExistingNow.filter(
              (player) => player.normalizedKey === normalizedKey,
            );
            const numbers = sameKeyPlayers.map((player) => {
              const match = /^\((\d+)\)$/.exec(player.disambiguation ?? '');
              return match ? Number.parseInt(match[1], 10) : 1;
            });
            const next = numbers.length === 0 ? 2 : Math.max(...numbers) + 1;
            disambiguation = `(${next})`;
          }

          const teamId =
            tournament.status === 'RUNNING'
              ? row.normalizedTeamName
                ? (teamIds.get(normalizeTeamName(row.normalizedTeamName)) ?? null)
                : null
              : row.normalizedTeamName
                ? (teamIds.get(normalizeTeamName(row.normalizedTeamName)) ?? null)
                : null;

          const player: Player = {
            id: crypto.randomUUID(),
            firstName: row.firstName,
            lastName: row.lastName,
            category: row.normalizedCategory,
            gender: row.normalizedGender,
            teamId,
            disambiguation,
            normalizedKey,
          };
          await tournamentDatabase.players.add(player);
          allExistingNow.push(player);
          createdPlayers += 1;
        }

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

        const teamsAfter = await tournamentDatabase.teams.toArray();
        const underMinimumTeams = teamsAfter
          .filter(
            (team) =>
              team.status === 'ACTIVE' &&
              allExistingNow.filter((player) => player.teamId === team.id).length <
                tournament.rules.roster.min,
          )
          .map((team) => team.name);

        return {
          createdPlayers,
          skippedPlayers,
          createdTeams: teamResolutions.filter(
            (resolution) =>
              resolution.action === 'CREATE' &&
              tournament.status !== 'RUNNING' &&
              resolution.existingTeamId === null,
          ).length,
          teamNames: teamResolutions
            .filter(
              (resolution) => resolution.action === 'CREATE' && tournament.status !== 'RUNNING',
            )
            .map((resolution) => resolution.incomingName),
          underMinimumTeams,
        };
      },
    );
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
      [
        'teams',
        'players',
        'stages',
        'groups',
        'matches',
        'events',
        'draws',
        'backups',
        'tournament',
      ],
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
