import Dexie from 'dexie';
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
  MatchResult,
  Player,
  ProjectorState,
  RosterLimits,
  ScheduleConfig,
  Stage,
  Team,
  Tournament,
  TournamentRules,
  TournamentSnapshot,
  FormatParams,
  TournamentFile,
} from '../domain/model';
import {
  StoredTournamentFileState,
  TOURNAMENT_SCHEMA_VERSION,
  tournamentDatabase,
} from './tournament-database';
import { canCreateOrDeleteTeam, getDefaultTeamColorPair, normalizeTeamName } from '../domain/team';
import { normalizePlayerKey } from '../domain/player';
import { startTournament } from '../domain/start-tournament';
import {
  finishDetailMatch,
  finishDirectMatch,
  finishMatch as finishMatchDomain,
  finishWalkover as finishWalkoverDomain,
  editFinalizedMatch as editFinalizedMatchDomain,
  startMatch as startMatchDomain,
  switchDirectToDetail,
  undoWalkover as undoWalkoverDomain,
  undoMatchInProgress,
} from '../domain/match-control';
import {
  finishPendingWithdrawalWalkovers,
  reinstateTeam as reinstateTeamDomain,
  withdrawTeam as withdrawTeamDomain,
} from '../domain/team-withdrawal';
import { analyzeEditImpactWithDraws } from '../domain/edit-impact';
import { resolveMatches } from '../domain/resolve-matches';
import { createFixedClock } from '../domain/clock';
import { createSeededRng } from '../domain/rng';
import { closeTournament, reopenTournamentAfterMatchEdit } from '../domain/tournament-close';
import { backupCreated, backupQuotaExceeded, isQuotaExceededError } from './backup-events';

export interface MatchSaveInput {
  readonly match: Match;
  readonly events: readonly MatchEvent[];
}

export interface EditFinalizedMatchInput {
  readonly matchId: string;
  readonly result: MatchResult;
  readonly events: readonly MatchEvent[];
  readonly expectedAffectedMatchIds: readonly string[];
  readonly changedAt: string;
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

export const DEFAULT_FILE_WARNING_INTERVAL_MIN = 30;

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

  async getProjectorState(): Promise<ProjectorState> {
    const stored = await tournamentDatabase.projectorState.get('current');
    return stored ?? { forcedView: null, message: null, timer: null };
  }

  async saveProjectorState(state: ProjectorState): Promise<void> {
    await tournamentDatabase.transaction('rw', tournamentDatabase.projectorState, async () => {
      await tournamentDatabase.projectorState.put({ id: 'current', ...state });
    });
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

  async getBackups(): Promise<readonly Backup[]> {
    const backups = await tournamentDatabase.backups.toArray();
    return backups.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getTournamentFileState(): Promise<StoredTournamentFileState> {
    return (
      (await tournamentDatabase.tournamentFileState.get('current')) ?? {
        id: 'current',
        tournamentId: null,
        exportedAt: null,
        checksum: null,
        warningIntervalMin: DEFAULT_FILE_WARNING_INTERVAL_MIN,
      }
    );
  }

  async recordTournamentFileExport(
    tournamentId: string,
    exportedAt: string,
    checksum: string,
  ): Promise<void> {
    await tournamentDatabase.transaction(
      'rw',
      [tournamentDatabase.tournament, tournamentDatabase.tournamentFileState],
      async () => {
        const tournament = await this.getTournament();
        if (!tournament || tournament.id !== tournamentId) {
          throw new Error('Tournament changed while the file was being saved');
        }
        const state = await this.getTournamentFileState();
        await tournamentDatabase.tournamentFileState.put({
          ...state,
          tournamentId,
          exportedAt,
          checksum,
        });
      },
    );
  }

  async loadTournamentFile(file: TournamentFile): Promise<void> {
    const snapshot = file.data;
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
        'projectorState',
        'tournamentFileState',
      ],
      async () => {
        const current = await this.getSnapshot();
        if (current) await this.writeBackup('BEFORE_LOAD_FILE', current);

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
        await Promise.all([
          tournamentDatabase.tournament.put(snapshot.tournament),
          tournamentDatabase.players.bulkPut([...snapshot.players]),
          tournamentDatabase.teams.bulkPut([...snapshot.teams]),
          tournamentDatabase.stages.bulkPut([...snapshot.stages]),
          tournamentDatabase.groups.bulkPut([...snapshot.groups]),
          tournamentDatabase.matches.bulkPut([...snapshot.matches]),
          tournamentDatabase.events.bulkPut([...snapshot.events]),
          tournamentDatabase.draws.bulkPut([...snapshot.draws]),
        ]);

        const fileState = await this.getTournamentFileState();
        await Promise.all([
          tournamentDatabase.projectorState.put({
            id: 'current',
            forcedView: null,
            message: null,
            timer: null,
          }),
          tournamentDatabase.tournamentFileState.put({
            ...fileState,
            tournamentId: snapshot.tournament.id,
            exportedAt: file.exportedAt,
            checksum: file.checksum,
          }),
        ]);
      },
    );
  }

  async updateFileWarningInterval(intervalMin: number): Promise<void> {
    if (!Number.isInteger(intervalMin) || intervalMin < 1 || intervalMin > 1440) {
      throw new Error('File warning interval must be between 1 and 1440 minutes');
    }
    await tournamentDatabase.transaction('rw', tournamentDatabase.tournamentFileState, async () => {
      const state = await this.getTournamentFileState();
      await tournamentDatabase.tournamentFileState.put({
        ...state,
        warningIntervalMin: intervalMin,
      });
    });
  }

  async restoreBackup(backupId: string, changedAt: string): Promise<void> {
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
        const backup = await tournamentDatabase.backups.get(backupId);
        if (!backup) throw new Error('Backup is unavailable');
        const current = await this.getSnapshot();
        if (!current) throw new Error('No tournament is available');

        await this.writeBackup('MANUAL', current);
        const snapshot = backup.snapshot;
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
        await Promise.all([
          tournamentDatabase.tournament.put({
            ...snapshot.tournament,
            updatedAt: changedAt,
          }),
          tournamentDatabase.players.bulkPut([...snapshot.players]),
          tournamentDatabase.teams.bulkPut([...snapshot.teams]),
          tournamentDatabase.stages.bulkPut([...snapshot.stages]),
          tournamentDatabase.groups.bulkPut([...snapshot.groups]),
          tournamentDatabase.matches.bulkPut([...snapshot.matches]),
          tournamentDatabase.events.bulkPut([...snapshot.events]),
          tournamentDatabase.draws.bulkPut([...snapshot.draws]),
        ]);
      },
    );
  }

  async createPeriodicBackupIfDue(nowMs: number): Promise<boolean> {
    const snapshot = await this.getSnapshot();
    if (!snapshot) return false;
    const backups = await this.getBackups();
    const latestBackup = backups[0];
    const referenceTimestamp = latestBackup
      ? Date.parse(latestBackup.createdAt)
      : Date.parse(snapshot.tournament.createdAt);
    if (!Number.isFinite(referenceTimestamp)) {
      throw new Error('The latest backup timestamp is invalid');
    }

    const intervalMs = snapshot.tournament.backupIntervalMin * 60_000;
    if (nowMs - referenceTimestamp < intervalMs) return false;
    if (latestBackup && JSON.stringify(latestBackup.snapshot) === JSON.stringify(snapshot)) {
      return false;
    }
    if (!latestBackup && snapshot.tournament.updatedAt === snapshot.tournament.createdAt) {
      return false;
    }

    await this.createBackup('PERIODIC', snapshot);
    return true;
  }

  async updateBackupInterval(intervalMin: number): Promise<void> {
    if (!Number.isInteger(intervalMin) || intervalMin < 1 || intervalMin > 60) {
      throw new Error('Backup interval must be between 1 and 60 minutes');
    }
    await tournamentDatabase.transaction('rw', tournamentDatabase.tournament, async () => {
      const tournament = await this.getTournament();
      if (!tournament) throw new Error('No tournament is available');
      await tournamentDatabase.tournament.update(tournament.id, {
        backupIntervalMin: intervalMin,
        updatedAt: new Date().toISOString(),
      });
    });
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
        'projectorState',
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
          tournamentDatabase.projectorState.clear(),
        ]);
      },
    );
  }

  async resetFixture(now: string): Promise<void> {
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
        'projectorState',
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
          tournamentDatabase.projectorState.clear(),
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
        await this.finishReadyWithdrawalWalkovers(tournament, finishedAt);
        await tournamentDatabase.tournament.update(tournament.id, {
          updatedAt: finishedAt,
        });
      },
    );
  }

  async withdrawTeam(teamId: string, changedAt: string): Promise<void> {
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
          snapshot.draws.find((draw) => draw.payload.kind === 'TIEBREAK')?.seed ??
          'team-withdrawal';
        const resolved = resolveMatches(snapshot, createSeededRng(seed));
        const withdrawal = withdrawTeamDomain(
          snapshot,
          resolved,
          teamId,
          createFixedClock(Date.parse(changedAt)),
        );
        if (!withdrawal.ok) {
          throw new Error(`Team cannot be withdrawn: ${withdrawal.error.code}`);
        }

        await this.writeBackup('BEFORE_CASCADE_EDIT', snapshot);
        await tournamentDatabase.teams.put(withdrawal.value.team);
        if (withdrawal.value.matches.length > 0) {
          await tournamentDatabase.matches.bulkPut([...withdrawal.value.matches]);
          for (const match of withdrawal.value.matches) {
            if (snapshot.events.some((event) => event.matchId === match.id)) {
              await tournamentDatabase.events.where('matchId').equals(match.id).delete();
            }
          }
        }
        await tournamentDatabase.tournament.update(tournament.id, { updatedAt: changedAt });
      },
    );
  }

  async reinstateTeam(teamId: string, changedAt: string): Promise<void> {
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
        const reinstatement = reinstateTeamDomain(snapshot, teamId);
        if (!reinstatement.ok) {
          throw new Error(`Team cannot be reinstated: ${reinstatement.error.code}`);
        }

        await this.writeBackup('BEFORE_CASCADE_EDIT', snapshot);
        await tournamentDatabase.teams.put(reinstatement.value.team);
        if (reinstatement.value.matches.length > 0) {
          await tournamentDatabase.matches.bulkPut([...reinstatement.value.matches]);
        }
        await this.finishReadyWithdrawalWalkovers(tournament, changedAt);
        await tournamentDatabase.tournament.update(tournament.id, { updatedAt: changedAt });
      },
    );
  }

  async finishMatchWithEvents(
    matchId: string,
    events: readonly MatchEvent[],
    finishedAt: string,
    suddenDeathWinnerTeamId: string | null = null,
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
          suddenDeathWinnerTeamId,
        );
        if (!finished.ok) {
          throw new Error(`Detail match cannot finish: ${finished.error.code}`);
        }

        await this.writeBackup('MATCH_FINISHED', snapshot);
        await tournamentDatabase.matches.put(finished.value);
        if (snapshot.events.some((event) => event.matchId === matchId)) {
          await tournamentDatabase.events.where('matchId').equals(matchId).delete();
        }
        await tournamentDatabase.events.bulkPut([...events]);
        await this.finishReadyWithdrawalWalkovers(tournament, finishedAt);
        await tournamentDatabase.tournament.update(tournament.id, {
          updatedAt: finishedAt,
        });
      },
    );
  }

  async finishMatchDirect(
    matchId: string,
    homePoints: number,
    awayPoints: number,
    finishedAt: string,
    suddenDeathWinnerTeamId: string | null = null,
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
        const finished = finishDirectMatch(
          snapshot,
          resolved,
          matchId,
          homePoints,
          awayPoints,
          createFixedClock(Date.parse(finishedAt)),
          suddenDeathWinnerTeamId,
        );
        if (!finished.ok) {
          throw new Error(`Direct match cannot finish: ${finished.error.code}`);
        }

        await this.writeBackup('MATCH_FINISHED', snapshot);
        await tournamentDatabase.matches.put(finished.value);
        if (snapshot.events.some((event) => event.matchId === matchId)) {
          await tournamentDatabase.events.where('matchId').equals(matchId).delete();
        }
        await this.finishReadyWithdrawalWalkovers(tournament, finishedAt);
        await tournamentDatabase.tournament.update(tournament.id, {
          updatedAt: finishedAt,
        });
      },
    );
  }

  async finishMatchWalkover(
    matchId: string,
    absentTeamId: string,
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
        const finished = finishWalkoverDomain(
          snapshot,
          resolved,
          matchId,
          absentTeamId,
          createFixedClock(Date.parse(finishedAt)),
        );
        if (!finished.ok) {
          throw new Error(`Match cannot be marked as walkover: ${finished.error.code}`);
        }

        await this.writeBackup('MATCH_FINISHED', snapshot);
        await tournamentDatabase.matches.put(finished.value);
        if (snapshot.events.some((event) => event.matchId === matchId)) {
          await tournamentDatabase.events.where('matchId').equals(matchId).delete();
        }
        await this.finishReadyWithdrawalWalkovers(tournament, finishedAt);
        await tournamentDatabase.tournament.update(tournament.id, {
          updatedAt: finishedAt,
        });
      },
    );
  }

  async editFinalizedMatch(input: EditFinalizedMatchInput): Promise<string | null> {
    return tournamentDatabase.transaction(
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
        const edited = editFinalizedMatchDomain(
          snapshot,
          resolved,
          input.matchId,
          input.result,
          input.events,
          createFixedClock(Date.parse(input.changedAt)),
        );
        if (!edited.ok) {
          throw new Error(`Finalized match cannot be edited: ${edited.error.code}`);
        }

        const after: TournamentSnapshot = {
          ...snapshot,
          matches: snapshot.matches.map((match) =>
            match.id === input.matchId ? edited.value.match : match,
          ),
          events: [
            ...snapshot.events.filter((event) => event.matchId !== input.matchId),
            ...edited.value.events,
          ],
        };
        const analysis = analyzeEditImpactWithDraws(snapshot, after);
        const expectedIds = [...input.expectedAffectedMatchIds].sort();
        const actualIds = analysis.impact.affected.map((entry) => entry.matchId).sort();
        if (
          expectedIds.length !== actualIds.length ||
          expectedIds.some((matchId, index) => matchId !== actualIds[index])
        ) {
          throw new Error(
            'Match edit impact changed; refresh the fixture and review the edit again',
          );
        }

        let backupId: string | null = null;
        let matchesToReset: readonly Match[] = [];
        if (analysis.impact.affected.length > 0) {
          backupId = (await this.writeBackup('BEFORE_CASCADE_EDIT', snapshot)).id;
          const affectedIds = new Set(analysis.impact.affected.map((entry) => entry.matchId));
          matchesToReset = snapshot.matches
            .filter((match) => affectedIds.has(match.id) && match.id !== input.matchId)
            .map((match) => ({
              ...match,
              status: 'PENDING' as const,
              result: null,
              startedAt: null,
              finishedAt: null,
            }));
          await tournamentDatabase.matches.bulkPut(matchesToReset);
          for (const match of matchesToReset) {
            await tournamentDatabase.events.where('matchId').equals(match.id).delete();
          }
        }

        await tournamentDatabase.matches.put(edited.value.match);
        await tournamentDatabase.events.where('matchId').equals(input.matchId).delete();
        await tournamentDatabase.events.bulkPut([...edited.value.events]);
        if (analysis.draws.length > 0) {
          await tournamentDatabase.draws.bulkPut([...analysis.draws]);
        }
        await this.finishReadyWithdrawalWalkovers(tournament, input.changedAt);
        const matchesAfterEdit = snapshot.matches.map((match) => {
          if (match.id === input.matchId) return edited.value.match;
          if (matchesToReset.some((resetMatch) => resetMatch.id === match.id)) {
            return matchesToReset.find((resetMatch) => resetMatch.id === match.id) ?? match;
          }
          return match;
        });
        const reopenedTournament = reopenTournamentAfterMatchEdit(
          tournament,
          matchesAfterEdit,
          input.changedAt,
        );
        await tournamentDatabase.tournament.update(tournament.id, {
          status: reopenedTournament.status,
          updatedAt: input.changedAt,
        });
        return backupId;
      },
    );
  }

  async restoreCascadeEdit(backupId: string, changedAt: string): Promise<void> {
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
        const backup = await tournamentDatabase.backups.get(backupId);
        if (!backup || backup.reason !== 'BEFORE_CASCADE_EDIT') {
          throw new Error('Cascade edit backup is unavailable');
        }
        const snapshot = backup.snapshot;
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
        await Promise.all([
          tournamentDatabase.tournament.put({
            ...snapshot.tournament,
            updatedAt: changedAt,
          }),
          tournamentDatabase.players.bulkPut([...snapshot.players]),
          tournamentDatabase.teams.bulkPut([...snapshot.teams]),
          tournamentDatabase.stages.bulkPut([...snapshot.stages]),
          tournamentDatabase.groups.bulkPut([...snapshot.groups]),
          tournamentDatabase.matches.bulkPut([...snapshot.matches]),
          tournamentDatabase.events.bulkPut([...snapshot.events]),
          tournamentDatabase.draws.bulkPut([...snapshot.draws]),
          tournamentDatabase.backups.delete(backupId),
        ]);
      },
    );
  }

  async undoMatchWalkover(matchId: string, changedAt: string): Promise<void> {
    await tournamentDatabase.transaction(
      'rw',
      ['tournament', 'players', 'teams', 'stages', 'groups', 'matches', 'events', 'draws'],
      async () => {
        const tournament = await this.getTournament();
        if (!tournament) throw new Error('No tournament is available');
        const snapshot = await this.readSnapshot(tournament);
        const undone = undoWalkoverDomain(snapshot, matchId);
        if (!undone.ok) {
          throw new Error(`Walkover cannot be undone: ${undone.error.code}`);
        }

        await tournamentDatabase.matches.put(undone.value);
        await tournamentDatabase.tournament.update(tournament.id, {
          updatedAt: changedAt,
        });
      },
    );
  }

  async undoMatchInProgress(
    matchId: string,
    preserveEvents: boolean,
    resetTournament: boolean,
    changedAt: string,
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
        const undone = undoMatchInProgress(snapshot, matchId, preserveEvents);
        if (!undone.ok) {
          throw new Error(`In-progress match cannot be undone: ${undone.error.code}`);
        }
        if (resetTournament && !undone.value.shouldOfferFixtureReset) {
          throw new Error('Tournament cannot be returned to fixture generated');
        }

        await this.writeBackup('MANUAL', snapshot);
        await tournamentDatabase.matches.put(undone.value.match);
        if (!preserveEvents) {
          await tournamentDatabase.events.where('matchId').equals(matchId).delete();
        }
        await tournamentDatabase.tournament.update(tournament.id, {
          ...(resetTournament ? { status: 'FIXTURE_GENERATED' as const } : {}),
          updatedAt: changedAt,
        });
      },
    );
  }

  async switchDirectMatchToDetail(matchId: string, changedAt: string): Promise<void> {
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
        const switched = switchDirectToDetail(
          snapshot,
          matchId,
          createFixedClock(Date.parse(changedAt)),
        );
        if (!switched.ok) {
          throw new Error(`Direct match cannot switch to detail: ${switched.error.code}`);
        }

        await this.writeBackup('MATCH_FINISHED', snapshot);
        await tournamentDatabase.matches.put(switched.value);
        await tournamentDatabase.events.where('matchId').equals(matchId).delete();
        await tournamentDatabase.tournament.update(tournament.id, {
          updatedAt: changedAt,
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

  async saveSwissRound(input: {
    readonly stageId: string;
    readonly round: number;
    readonly matches: readonly Match[];
    readonly draws: readonly Draw[];
  }): Promise<void> {
    await tournamentDatabase.transaction(
      'rw',
      [
        tournamentDatabase.tournament,
        tournamentDatabase.teams,
        tournamentDatabase.stages,
        tournamentDatabase.matches,
        tournamentDatabase.draws,
      ],
      async () => {
        const tournament = await this.getTournament();
        if (!tournament || tournament.status !== 'RUNNING') {
          throw new Error('Swiss rounds can only be added while the tournament is running');
        }
        if (
          tournament.formatParams?.format !== 'SWISS' ||
          input.round > tournament.formatParams.rounds
        ) {
          throw new Error('Swiss round is outside the configured tournament format');
        }
        const stage = await tournamentDatabase.stages.get(input.stageId);
        if (stage?.type !== 'SWISS') {
          throw new Error('Swiss round stage does not exist');
        }
        if (
          input.matches.length === 0 ||
          input.matches.some(
            (match) =>
              match.stageId !== input.stageId ||
              match.round !== input.round ||
              match.status === 'IN_PROGRESS',
          )
        ) {
          throw new Error('Swiss round preview is invalid');
        }
        const activeTeamIds = (await tournamentDatabase.teams.toArray())
          .filter((team) => team.status === 'ACTIVE')
          .map((team) => team.id);
        const participantIds = input.matches.flatMap((match) =>
          [match.home, match.away].flatMap((reference) =>
            reference.kind === 'TEAM' ? [reference.teamId] : [],
          ),
        );
        const byeMatches = input.matches.filter(
          (match) => match.isPhantom && match.home.kind === 'TEAM' && match.away.kind === 'BYE',
        );
        if (
          activeTeamIds.length < 4 ||
          participantIds.length !== activeTeamIds.length ||
          new Set(participantIds).size !== participantIds.length ||
          activeTeamIds.some((teamId) => !participantIds.includes(teamId)) ||
          input.matches.filter((match) => !match.isPhantom && !match.isConditional).length !==
            Math.floor(activeTeamIds.length / 2) ||
          byeMatches.length !== activeTeamIds.length % 2 ||
          byeMatches.some((match) => match.status !== 'FINISHED' || match.result === null)
        ) {
          throw new Error('Swiss round does not include each active team exactly once');
        }

        const existingMatches = await tournamentDatabase.matches
          .where('stageId')
          .equals(input.stageId)
          .toArray();
        const lastRound = existingMatches.reduce(
          (maximum, match) => Math.max(maximum, match.round),
          0,
        );
        if (input.round !== lastRound + 1 || lastRound === 0) {
          throw new Error('Swiss round is out of sequence');
        }
        if (
          existingMatches.some(
            (match) =>
              match.round === lastRound &&
              (match.status !== 'FINISHED' || match.result === null),
          )
        ) {
          throw new Error('The previous Swiss round is not complete');
        }
        if (existingMatches.some((match) => match.round === input.round)) {
          throw new Error('Swiss round already exists');
        }

        await tournamentDatabase.matches.bulkPut([...input.matches]);
        if (input.draws.length > 0) {
          await tournamentDatabase.draws.bulkPut([...input.draws]);
        }
        await tournamentDatabase.tournament.update(tournament.id, {
          updatedAt: new Date().toISOString(),
        });
      },
    );
  }

  async closeTournament(closedAt: string): Promise<void> {
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
        const closed = closeTournament(
          tournament,
          snapshot.matches,
          createFixedClock(Date.parse(closedAt)),
        );
        if (!closed.ok) {
          throw new Error(`Tournament cannot be closed: ${closed.error}`);
        }
        await this.writeBackup('MANUAL', snapshot);
        await tournamentDatabase.tournament.update(tournament.id, {
          status: closed.value.status,
          updatedAt: closed.value.updatedAt,
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

  private async finishReadyWithdrawalWalkovers(
    tournament: Tournament,
    changedAt: string,
  ): Promise<void> {
    const snapshot = await this.readSnapshot(tournament);
    const seed =
      snapshot.draws.find((draw) => draw.payload.kind === 'TIEBREAK')?.seed ?? 'team-withdrawal';
    const resolved = resolveMatches(snapshot, createSeededRng(seed));
    const finished = finishPendingWithdrawalWalkovers(
      snapshot,
      resolved,
      createFixedClock(Date.parse(changedAt)),
    );
    if (!finished.ok) {
      throw new Error(`Pending withdrawal walkovers cannot be completed: ${finished.error.code}`);
    }
    if (finished.value.matches.length > 0) {
      await tournamentDatabase.matches.bulkPut([...finished.value.matches]);
      for (const match of finished.value.matches) {
        if (snapshot.events.some((event) => event.matchId === match.id)) {
          await tournamentDatabase.events.where('matchId').equals(match.id).delete();
        }
      }
    }
  }

  private async writeBackup(reason: BackupReason, snapshot: TournamentSnapshot): Promise<Backup> {
    const backup: Backup = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      reason,
      snapshot,
    };
    try {
      await tournamentDatabase.backups.add(backup);
      const rotatingBackups = (await tournamentDatabase.backups.toArray())
        .filter((entry) => entry.reason !== 'TOURNAMENT_START')
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      const oldIds = rotatingBackups.slice(10).map((entry) => entry.id);
      if (oldIds.length > 0) {
        await tournamentDatabase.backups.bulkDelete(oldIds);
      }
    } catch (error) {
      if (isQuotaExceededError(error)) backupQuotaExceeded.next();
      throw error;
    }
    const transaction = Dexie.currentTransaction;
    if (transaction) transaction.on('complete', () => backupCreated.next(backup));
    else backupCreated.next(backup);
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
        await this.writeBackup('BEFORE_IMPORT', snapshot);

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

        await this.writeBackup('BEFORE_CASCADE_EDIT', {
          tournament,
          players,
          teams,
          stages,
          groups,
          matches,
          events,
          draws,
        });

        await tournamentDatabase.players.where('teamId').equals(teamId).modify({ teamId: null });
        await tournamentDatabase.teams.delete(teamId);
        await tournamentDatabase.tournament.update(tournament.id, {
          updatedAt: new Date().toISOString(),
        });
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
