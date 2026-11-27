import {
  Backup,
  BackupReason,
  Category,
  CategoryStage,
  Draw,
  Gender,
  Group,
  Match,
  MatchEvent,
  Player,
  RosterLimits,
  ScheduleConfig,
  Stage,
  Team,
  Tournament,
  TournamentRules,
  TournamentSnapshot,
  FormatParams,
} from '../domain/model';
import { TOURNAMENT_SCHEMA_VERSION, tournamentDatabase } from './tournament-database';
import { canCreateOrDeleteTeam, getDefaultTeamColorPair, normalizeTeamName } from '../domain/team';
import { normalizePlayerKey } from '../domain/player';
import { startTournament } from '../domain/start-tournament';
import {
  finishDetailMatch,
  finishMatch as finishMatchDomain,
  startMatch as startMatchDomain,
} from '../domain/match-control';
import { resolveMatches } from '../domain/resolve-matches';
import { createFixedClock } from '../domain/clock';
import { createSeededRng } from '../domain/rng';

export interface MatchSaveInput {
  readonly match: Match;
  readonly events: readonly MatchEvent[];
}

export interface MatchOrderUpdate {
  readonly matchId: string;
  readonly order: number;
}

export interface SaveFixtureInput {
  readonly formatParams: FormatParams;
  readonly stages: readonly Stage[];
  readonly groups: readonly Group[];
  readonly matches: readonly Match[];
  readonly draws: readonly Draw[];
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

export interface ApplyTeamDrawInput {
  readonly assignments: readonly {
    readonly targetId: string;
    readonly playerIds: readonly string[];
  }[];
  readonly newTeams: readonly Team[];
  readonly draw: Draw;
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

  async getSnapshot(): Promise<TournamentSnapshot | null> {
    const [tournament, players, teams, stages, groups, matches, events, draws] = await Promise.all([
      this.getTournament(),
      tournamentDatabase.players.toArray(),
      tournamentDatabase.teams.toArray(),
      tournamentDatabase.stages.toArray(),
      tournamentDatabase.groups.toArray(),
      tournamentDatabase.matches.toArray(),
      tournamentDatabase.events.toArray(),
      tournamentDatabase.draws.toArray(),
    ]);
    return tournament
      ? { tournament, players, teams, stages, groups, matches, events, draws }
      : null;
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

  async deleteTournamentWithBackup(): Promise<void> {
    await tournamentDatabase.transaction(
      'rw',
      [
        'tournament',
        'players',
        'teams',
        'stages',
        'groups',
        'matches',
        'events',
        'draws',
        'backups',
      ],
      async () => {
        const tournament = await this.getTournament();
        if (!tournament) {
          throw new Error('No tournament is available');
        }

        await this.writeBackup('BEFORE_RESET', await this.readSnapshot(tournament));
        await Promise.all([
          tournamentDatabase.tournament.clear(),
          tournamentDatabase.players.clear(),
          tournamentDatabase.teams.clear(),
          tournamentDatabase.stages.clear(),
          tournamentDatabase.groups.clear(),
          tournamentDatabase.matches.clear(),
          tournamentDatabase.events.clear(),
          tournamentDatabase.draws.clear(),
        ]);
      },
    );
  }

  async resetFixture(now: string): Promise<void> {
    await tournamentDatabase.transaction(
      'rw',
      [
        'tournament',
        'teams',
        'stages',
        'groups',
        'matches',
        'events',
        'draws',
        'backups',
      ],
      async () => {
        const tournament = await this.getTournament();
        if (!tournament) {
          throw new Error('No tournament is available');
        }
        if (tournament.status !== 'RUNNING') {
          throw new Error('Fixture can only be reset while the tournament is running');
        }

        const snapshot = await this.readSnapshot(tournament);
        await this.writeBackup('BEFORE_RESET', snapshot);
        await Promise.all([
          tournamentDatabase.stages.clear(),
          tournamentDatabase.groups.clear(),
          tournamentDatabase.matches.clear(),
          tournamentDatabase.events.clear(),
          tournamentDatabase.draws.clear(),
          tournamentDatabase.teams.bulkPut(
            snapshot.teams.map((team) => ({ ...team, status: 'ACTIVE' })),
          ),
          tournamentDatabase.tournament.update(tournament.id, {
            status: 'SETUP',
            schedule: { ...tournament.schedule, breaks: [] },
            updatedAt: now,
          }),
        ]);

        const teamDraws = snapshot.draws.filter((draw) => draw.payload.kind === 'TEAMS');
        if (teamDraws.length > 0) {
          await tournamentDatabase.draws.bulkPut(teamDraws);
        }
      },
    );
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

  async setMatchInProgress(matchId: string, startedAt: string): Promise<void> {
    await tournamentDatabase.transaction(
      'rw',
      ['tournament', 'players', 'teams', 'stages', 'groups', 'matches', 'events', 'draws'],
      async () => {
        const tournament = await this.getTournament();
        if (!tournament) throw new Error('No tournament is available');
        const snapshot = await this.readSnapshot(tournament);
        const seed =
          snapshot.draws.find((draw) => draw.payload.kind === 'TIEBREAK')?.seed ?? 'match-control';
        const resolved = resolveMatches(snapshot, createSeededRng(seed));
        const started = startMatchDomain(
          snapshot,
          resolved,
          matchId,
          createFixedClock(Date.parse(startedAt)),
        );
        if (!started.ok) throw new Error(`Match cannot start: ${started.error.code}`);

        await tournamentDatabase.matches.put(started.value);
        await tournamentDatabase.tournament.update(tournament.id, {
          updatedAt: startedAt,
        });
      },
    );
  }

  async finishMatch(matchId: string, finishedAt: string): Promise<void> {
    await tournamentDatabase.transaction(
      'rw',
      [
        'tournament',
        'players',
        'teams',
        'stages',
        'groups',
        'matches',
        'events',
        'draws',
        'backups',
      ],
      async () => {
        const tournament = await this.getTournament();
        if (!tournament) throw new Error('No tournament is available');
        const snapshot = await this.readSnapshot(tournament);
        const finished = finishMatchDomain(
          snapshot,
          matchId,
          createFixedClock(Date.parse(finishedAt)),
        );
        if (!finished.ok) throw new Error(`Match cannot finish: ${finished.error.code}`);

        await this.writeBackup('MATCH_FINISHED', snapshot);
        await tournamentDatabase.matches.put(finished.value);
        await tournamentDatabase.tournament.update(tournament.id, {
          updatedAt: finishedAt,
        });
      },
    );
  }

  async finishMatchWithEvents(
    matchId: string,
    events: readonly MatchEvent[],
    finishedAt: string,
  ): Promise<void> {
    await tournamentDatabase.transaction(
      'rw',
      [
        'tournament',
        'players',
        'teams',
        'stages',
        'groups',
        'matches',
        'events',
        'draws',
        'backups',
      ],
      async () => {
        const tournament = await this.getTournament();
        if (!tournament) throw new Error('No tournament is available');
        const snapshot = await this.readSnapshot(tournament);
        const seed =
          snapshot.draws.find((draw) => draw.payload.kind === 'TIEBREAK')?.seed ?? 'match-control';
        const resolved = resolveMatches(snapshot, createSeededRng(seed));
        const finished = finishDetailMatch(
          snapshot,
          resolved,
          matchId,
          events,
          createFixedClock(Date.parse(finishedAt)),
        );
        if (!finished.ok) {
          throw new Error(`Detail match cannot finish: ${finished.error.code}`);
        }

        await this.writeBackup('MATCH_FINISHED', snapshot);
        await tournamentDatabase.matches.put(finished.value);
        await tournamentDatabase.events.where('matchId').equals(matchId).delete();
        await tournamentDatabase.events.bulkPut([...events]);
        await tournamentDatabase.tournament.update(tournament.id, {
          updatedAt: finishedAt,
        });
      },
    );
  }

  async updateMatchOrders(orders: readonly MatchOrderUpdate[]): Promise<void> {
    if (orders.length === 0) return;
    if (
      new Set(orders.map((entry) => entry.matchId)).size !== orders.length ||
      orders.some((entry) => !Number.isInteger(entry.order) || entry.order < 1)
    ) {
      throw new Error('Match order updates must have unique ids and positive integer positions');
    }

    await tournamentDatabase.transaction(
      'rw',
      tournamentDatabase.matches,
      tournamentDatabase.tournament,
      async () => {
        const existingMatches = await tournamentDatabase.matches.toArray();
        const orderById = new Map(existingMatches.map((match) => [match.id, match.order]));
        const matchesById = new Map(existingMatches.map((match) => [match.id, match]));
        for (const entry of orders) {
          const current = matchesById.get(entry.matchId);
          if (!current) throw new Error(`Match ${entry.matchId} does not exist`);
          if (
            current.order !== entry.order &&
            (current.status !== 'PENDING' || current.isPhantom || current.isConditional)
          ) {
            throw new Error(`Match ${entry.matchId} is no longer reorderable`);
          }
          orderById.set(entry.matchId, entry.order);
        }
        const lockedMatches = existingMatches.filter(
          (match) => match.status !== 'PENDING' || match.isPhantom || match.isConditional,
        );
        const reorderableMatches = existingMatches.filter(
          (match) => match.status === 'PENDING' && !match.isPhantom && !match.isConditional,
        );
        for (const lockedMatch of lockedMatches) {
          for (const pendingMatch of reorderableMatches) {
            const previousPendingOrder = pendingMatch.order;
            const nextPendingOrder = orderById.get(pendingMatch.id) ?? previousPendingOrder;
            const nextLockedOrder = orderById.get(lockedMatch.id) ?? lockedMatch.order;
            if (previousPendingOrder > lockedMatch.order && nextPendingOrder < nextLockedOrder) {
              throw new Error(`Match ${pendingMatch.id} cannot be moved before a locked match`);
            }
          }
        }
        if (new Set(orderById.values()).size !== orderById.size) {
          throw new Error('Match order updates would create duplicate positions');
        }

        const changedOrders = orders.filter(
          (entry) => matchesById.get(entry.matchId)?.order !== entry.order,
        );
        if (changedOrders.length === 0) return;
        await tournamentDatabase.matches.bulkUpdate(
          changedOrders.map((entry) => ({
            key: entry.matchId,
            changes: { order: entry.order },
          })),
        );

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

  async updateRosterLimits(roster: RosterLimits): Promise<void> {
    await tournamentDatabase.transaction('rw', tournamentDatabase.tournament, async () => {
      const tournament = await this.getTournament();
      if (!tournament) {
        throw new Error('No tournament is available');
      }
      if (tournament.status === 'RUNNING') {
        throw new Error('Roster limits cannot be changed while the tournament is running');
      }
      await tournamentDatabase.tournament.update(tournament.id, {
        rules: { ...tournament.rules, roster },
        updatedAt: new Date().toISOString(),
      });
    });
  }

  async updateTournamentConfiguration(input: {
    readonly name: string;
    readonly date: string;
    readonly rules: TournamentRules;
    readonly schedule: ScheduleConfig;
  }): Promise<void> {
    await tournamentDatabase.transaction('rw', tournamentDatabase.tournament, async () => {
      const tournament = await this.getTournament();
      if (!tournament) {
        throw new Error('No tournament is available');
      }
      await tournamentDatabase.tournament.update(tournament.id, {
        name: input.name,
        date: input.date,
        rules: input.rules,
        schedule: input.schedule,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  async updateFormat(
    formatParams: FormatParams,
    scheduleTiming: Pick<ScheduleConfig, 'matchDurationMin' | 'restMin'>,
  ): Promise<void> {
    await tournamentDatabase.transaction(
      'rw',
      [
        'tournament',
        'players',
        'teams',
        'stages',
        'groups',
        'matches',
        'events',
        'draws',
        'backups',
      ],
      async () => {
        const tournament = await this.getTournament();
        if (!tournament) {
          throw new Error('No tournament is available');
        }
        if (tournament.status === 'RUNNING' || tournament.status === 'FINISHED') {
          throw new Error('Format cannot be changed after the tournament starts');
        }
        const formatChanged =
          tournament.formatParams !== null &&
          JSON.stringify(tournament.formatParams) !== JSON.stringify(formatParams);
        if (formatChanged) {
          const [stages, groups, matches, events, draws] = await Promise.all([
            tournamentDatabase.stages.toArray(),
            tournamentDatabase.groups.toArray(),
            tournamentDatabase.matches.toArray(),
            tournamentDatabase.events.toArray(),
            tournamentDatabase.draws.toArray(),
          ]);
          if (
            tournament.status === 'FIXTURE_GENERATED' ||
            stages.length > 0 ||
            groups.length > 0 ||
            matches.length > 0 ||
            events.length > 0 ||
            draws.some((draw) => draw.payload.kind !== 'TEAMS')
          ) {
            await this.writeBackup('BEFORE_RESET', {
              tournament,
              players: await tournamentDatabase.players.toArray(),
              teams: await tournamentDatabase.teams.toArray(),
              stages,
              groups,
              matches,
              events,
              draws,
            });
            await Promise.all([
              tournamentDatabase.stages.clear(),
              tournamentDatabase.groups.clear(),
              tournamentDatabase.matches.clear(),
              tournamentDatabase.events.clear(),
              tournamentDatabase.draws.clear(),
            ]);
            const teamDraws = draws.filter((draw) => draw.payload.kind === 'TEAMS');
            if (teamDraws.length > 0) {
              await tournamentDatabase.draws.bulkPut(teamDraws);
            }
          }
        }
        const updates: Partial<Tournament> = {
          formatParams,
          schedule: {
            ...tournament.schedule,
            ...scheduleTiming,
            ...(formatChanged ? { breaks: [] } : {}),
          },
          ...(formatChanged && tournament.status === 'FIXTURE_GENERATED'
            ? { status: 'SETUP' }
            : {}),
          updatedAt: new Date().toISOString(),
        };
        await tournamentDatabase.tournament.update(tournament.id, updates);
      },
    );
  }

  async saveFixture(input: SaveFixtureInput): Promise<void> {
    await tournamentDatabase.transaction(
      'rw',
      [
        'tournament',
        'teams',
        'players',
        'stages',
        'groups',
        'matches',
        'events',
        'draws',
        'backups',
      ],
      async () => {
        const tournament = await this.getTournament();
        if (!tournament) throw new Error('No tournament is available');
        if (tournament.status === 'RUNNING' || tournament.status === 'FINISHED') {
          throw new Error('Fixture cannot be changed after the tournament starts');
        }
        if (
          (await tournamentDatabase.teams.toArray()).filter((team) => team.status === 'ACTIVE')
            .length < 2
        ) {
          throw new Error('At least two active teams are required to generate a fixture');
        }
        if (input.matches.length === 0) {
          throw new Error('The generated fixture contains no matches');
        }

        if (tournament.status === 'FIXTURE_GENERATED') {
          const snapshot = await this.readSnapshot(tournament);
          await this.writeBackup('BEFORE_RESET', snapshot);
        }

        const existingDraws = await tournamentDatabase.draws.toArray();
        const preservedDraws =
          tournament.status === 'FIXTURE_GENERATED'
            ? existingDraws.filter((draw) => draw.payload.kind === 'TEAMS')
            : existingDraws;
        const drawsById = new Map(
          [...preservedDraws, ...input.draws].map((draw) => [draw.id, draw]),
        );

        await Promise.all([
          tournamentDatabase.stages.clear(),
          tournamentDatabase.groups.clear(),
          tournamentDatabase.matches.clear(),
          tournamentDatabase.events.clear(),
          tournamentDatabase.draws.clear(),
        ]);
        if (input.stages.length > 0) {
          await tournamentDatabase.stages.bulkPut([...input.stages]);
        }
        if (input.groups.length > 0) {
          await tournamentDatabase.groups.bulkPut([...input.groups]);
        }
        await tournamentDatabase.matches.bulkPut([...input.matches]);
        if (drawsById.size > 0) {
          await tournamentDatabase.draws.bulkPut([...drawsById.values()]);
        }
        await tournamentDatabase.tournament.update(tournament.id, {
          formatParams: input.formatParams,
          status: 'FIXTURE_GENERATED',
          ...(tournament.status === 'FIXTURE_GENERATED'
            ? { schedule: { ...tournament.schedule, breaks: [] } }
            : {}),
          updatedAt: new Date().toISOString(),
        });
      },
    );
  }

  async startTournament(startedAt: string): Promise<void> {
    await tournamentDatabase.transaction(
      'rw',
      [
        'tournament',
        'players',
        'teams',
        'stages',
        'groups',
        'matches',
        'events',
        'draws',
        'backups',
      ],
      async () => {
        const tournament = await this.getTournament();
        if (!tournament) {
          throw new Error('No tournament is available');
        }

        const transition = startTournament(tournament, startedAt);
        if (!transition.ok) {
          throw new Error(`Tournament cannot be started: ${transition.error}`);
        }
        const snapshot = await this.readSnapshot(tournament);
        if (snapshot.matches.length === 0) {
          throw new Error('Tournament fixture is empty');
        }

        await this.writeBackup('TOURNAMENT_START', snapshot);
        await tournamentDatabase.tournament.update(tournament.id, {
          status: transition.value.status,
          updatedAt: transition.value.updatedAt,
        });
      },
    );
  }

  private async readSnapshot(tournament: Tournament): Promise<TournamentSnapshot> {
    const [players, teams, stages, groups, matches, events, draws] = await Promise.all([
      tournamentDatabase.players.toArray(),
      tournamentDatabase.teams.toArray(),
      tournamentDatabase.stages.toArray(),
      tournamentDatabase.groups.toArray(),
      tournamentDatabase.matches.toArray(),
      tournamentDatabase.events.toArray(),
      tournamentDatabase.draws.toArray(),
    ]);
    return { tournament, players, teams, stages, groups, matches, events, draws };
  }

  private async writeBackup(reason: BackupReason, snapshot: TournamentSnapshot): Promise<Backup> {
    const backup: Backup = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      reason,
      snapshot,
    };
    await tournamentDatabase.backups.add(backup);
    if ((await tournamentDatabase.backups.count()) <= 10) {
      return backup;
    }
    const oldIds = await tournamentDatabase.backups
      .orderBy('createdAt')
      .reverse()
      .offset(10)
      .primaryKeys();
    if (oldIds.length > 0) {
      await tournamentDatabase.backups.bulkDelete(oldIds);
    }
    return backup;
  }

  async createBackup(reason: BackupReason, snapshot: TournamentSnapshot): Promise<Backup> {
    return tournamentDatabase.transaction('rw', tournamentDatabase.backups, () =>
      this.writeBackup(reason, snapshot),
    );
  }

  async saveDraw(draw: Draw): Promise<void> {
    await tournamentDatabase.transaction('rw', tournamentDatabase.draws, async () => {
      await tournamentDatabase.draws.put(draw);
    });
  }

  async getGroups(): Promise<readonly Group[]> {
    return tournamentDatabase.groups.toArray();
  }

  async saveGroupDraw(input: {
    readonly stage: Stage;
    readonly groups: readonly Group[];
    readonly draw: Draw;
  }): Promise<void> {
    await tournamentDatabase.transaction(
      'rw',
      tournamentDatabase.stages,
      tournamentDatabase.groups,
      tournamentDatabase.draws,
      tournamentDatabase.tournament,
      async () => {
        const tournament = await this.getTournament();
        if (!tournament) {
          throw new Error('No tournament is available');
        }
        if (tournament.status !== 'SETUP' && tournament.status !== 'FIXTURE_GENERATED') {
          throw new Error('Group draws are disabled after the tournament starts');
        }

        await tournamentDatabase.stages.put(input.stage);
        await tournamentDatabase.groups.where('stageId').equals(input.stage.id).delete();
        await tournamentDatabase.groups.bulkPut([...input.groups]);
        await tournamentDatabase.draws.put(input.draw);
        await tournamentDatabase.tournament.update(tournament.id, {
          updatedAt: new Date().toISOString(),
        });
      },
    );
  }

  async applyTeamDraw(input: ApplyTeamDrawInput): Promise<void> {
    await tournamentDatabase.transaction(
      'rw',
      tournamentDatabase.teams,
      tournamentDatabase.players,
      tournamentDatabase.draws,
      tournamentDatabase.tournament,
      async () => {
        const tournament = await this.getTournament();
        if (!tournament || tournament.status === 'RUNNING') {
          throw new Error('Team draws are disabled while the tournament is running');
        }
        const playerIds = input.assignments.flatMap((assignment) => assignment.playerIds);
        const players = await tournamentDatabase.players.where('id').anyOf(playerIds).toArray();
        if (
          players.length !== playerIds.length ||
          players.some((player) => player.teamId !== null)
        ) {
          throw new Error('Team draw players are no longer unassigned');
        }

        await tournamentDatabase.teams.bulkPut([...input.newTeams]);
        const teams = await tournamentDatabase.teams.toArray();
        const teamIds = new Set(teams.map((team) => team.id));
        if (input.assignments.some((assignment) => !teamIds.has(assignment.targetId))) {
          throw new Error('Team draw target no longer exists');
        }
        for (const assignment of input.assignments) {
          if (assignment.playerIds.length === 0 || !assignment.targetId) {
            continue;
          }
          await tournamentDatabase.players
            .where('id')
            .anyOf([...assignment.playerIds])
            .modify({ teamId: assignment.targetId });
        }
        await tournamentDatabase.draws.put(input.draw);

        await tournamentDatabase.tournament.update(tournament.id, {
          updatedAt: new Date().toISOString(),
        });
      },
    );
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
        let createdTeamOffset = 0;
        for (const resolution of teamResolutions) {
          if (resolution.existingTeamId) {
            teamIds.set(normalizeTeamName(resolution.incomingName), resolution.existingTeamId);
            continue;
          }
          if (tournament.status === 'RUNNING') continue;
          if (resolution.action !== 'CREATE') continue;

          const teamId = crypto.randomUUID();
          const colors = getDefaultTeamColorPair(existingTeams, createdTeamOffset);
          createdTeamOffset += 1;
          const team: Team = {
            id: teamId,
            name: resolution.incomingName,
            primaryColor: colors.primary,
            secondaryColor: colors.secondary,
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
          if (row.differentPerson || duplicateAction === 'DISTINCT') {
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
