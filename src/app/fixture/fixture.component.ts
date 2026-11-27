import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tournamentRepository } from '../../data/tournament-repository';
import { computeFormatOption } from '../../domain/format-options';
import { generateFixture } from '../../domain/fixture';
import { movePendingMatch, resetSuggestedMatchOrder } from '../../domain/match-order';
import {
  FormatOption,
  Match,
  ResolvedMatch,
  Stage,
  Team,
  TournamentSnapshot,
} from '../../domain/model';
import { createSeededRng } from '../../domain/rng';
import { computeScheduleDetails, ScheduleDetails } from '../../domain/schedule';
import { getRosterStatus } from '../../domain/team';
import { resolveMatches } from '../../domain/resolve-matches';
import { FIXTURE_STRINGS } from '../../i18n/fixture-strings';
import { MATCH_ORDER_STRINGS } from '../../i18n/match-order-strings';
import { showErrorPopup } from '../error-popup';
import { assignGeneratedFixtureIds } from './fixture-id-mapping';

interface FixtureMatchRow {
  readonly match: Match;
  readonly homeLabel: string;
  readonly awayLabel: string;
  readonly groupLabel: string | null;
  readonly estimatedStart: string | null;
}

interface FixtureRoundView {
  readonly number: number;
  readonly matches: readonly FixtureMatchRow[];
}

interface FixtureStageView {
  readonly stage: Stage;
  readonly rounds: readonly FixtureRoundView[];
}

@Component({
  selector: 'app-fixture',
  templateUrl: './fixture.component.html',
  styleUrl: './fixture.component.css',
})
export class FixtureComponent implements OnInit {
  private readonly router = inject(Router);

  protected readonly strings = FIXTURE_STRINGS;
  protected readonly snapshot = signal<TournamentSnapshot | null>(null);
  protected readonly resolvedMatches = signal<readonly ResolvedMatch[]>([]);
  protected readonly scheduleDetails = signal<ScheduleDetails>({
    entries: [],
    orderedMatchIds: [],
    minimumRestByTeam: [],
    consecutiveAppearances: [],
  });
  protected readonly suggestedOrderIds = signal<readonly string[]>([]);
  protected readonly isBusy = signal(false);
  protected readonly statusMessage = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected get activeTeams(): readonly Team[] {
    return this.snapshot()?.teams.filter((team) => team.status === 'ACTIVE') ?? [];
  }

  protected get hasFixture(): boolean {
    const status = this.snapshot()?.tournament.status;
    return status === 'FIXTURE_GENERATED' || status === 'RUNNING' || status === 'FINISHED';
  }

  protected get canModifyFixture(): boolean {
    const status = this.snapshot()?.tournament.status;
    return status === 'SETUP' || status === 'FIXTURE_GENERATED';
  }

  protected get formatOption(): FormatOption | null {
    const snapshot = this.snapshot();
    const params = snapshot?.tournament.formatParams;
    return snapshot && params
      ? computeFormatOption(this.activeTeams.length, snapshot.tournament.schedule, params)
      : null;
  }

  protected get totalMatches(): number {
    return (
      this.snapshot()?.matches.filter((match) => !match.isPhantom && !match.isConditional).length ??
      0
    );
  }

  protected get consecutiveAppearances(): ScheduleDetails['consecutiveAppearances'] {
    return this.scheduleDetails().consecutiveAppearances;
  }

  protected get stageViews(): readonly FixtureStageView[] {
    const snapshot = this.snapshot();
    if (!snapshot) return [];
    const resolvedById = new Map(this.resolvedMatches().map((entry) => [entry.matchId, entry]));
    const scheduleById = new Map(
      this.scheduleDetails().entries.map((entry) => [entry.matchId, entry.estimatedStart]),
    );
    return [...snapshot.stages]
      .sort((left, right) => left.order - right.order)
      .map((stage) => {
        const stageMatches = snapshot.matches
          .filter((match) => match.stageId === stage.id && !match.isPhantom && !match.isConditional)
          .sort((left, right) => left.round - right.round || left.order - right.order);
        const matchesByRound = new Map<number, FixtureMatchRow[]>();
        for (const match of stageMatches) {
          const resolved = resolvedById.get(match.id);
          const group = snapshot.groups.find((entry) => entry.id === match.groupId);
          const rows = matchesByRound.get(match.round) ?? [];
          rows.push({
            match,
            homeLabel: resolved?.homeLabel ?? this.referenceLabel(match.home, snapshot),
            awayLabel: resolved?.awayLabel ?? this.referenceLabel(match.away, snapshot),
            groupLabel: group ? this.strings.group.replace('{name}', group.name) : null,
            estimatedStart: scheduleById.get(match.id) ?? null,
          });
          matchesByRound.set(match.round, rows);
        }
        return {
          stage,
          rounds: [...matchesByRound.entries()]
            .sort(([left], [right]) => left - right)
            .map(([number, matches]) => ({ number, matches })),
        };
      });
  }

  protected get underMinimumTeams(): readonly { readonly name: string; readonly count: number }[] {
    const snapshot = this.snapshot();
    if (!snapshot) return [];
    return this.activeTeams
      .map((team) => ({
        team,
        status: getRosterStatus(snapshot.players, team.id, snapshot.tournament.rules.roster),
      }))
      .filter(({ status }) => status.state === 'BELOW_MINIMUM')
      .map(({ team, status }) => ({ name: team.name, count: status.count }));
  }

  protected get shortRestTeams(): readonly { readonly name: string; readonly rest: number }[] {
    const snapshot = this.snapshot();
    if (!snapshot) return [];
    const requiredRest = snapshot.tournament.schedule.restMin;
    return this.scheduleDetails()
      .minimumRestByTeam.filter(
        (entry): entry is typeof entry & { readonly minimumRestMin: number } =>
          entry.minimumRestMin !== null && entry.minimumRestMin < requiredRest,
      )
      .map((entry) => ({ name: entry.teamName, rest: entry.minimumRestMin }));
  }

  protected statusLabel(status: Match['status']): string {
    if (status === 'IN_PROGRESS') return this.strings.inProgress;
    if (status === 'FINISHED') return this.strings.finished;
    return this.strings.pending;
  }

  protected canMoveMatch(match: Match, direction: 'UP' | 'DOWN'): boolean {
    const snapshot = this.snapshot();
    if (
      !snapshot ||
      !this.canModifyFixture ||
      match.status !== 'PENDING' ||
      match.isPhantom ||
      match.isConditional
    ) {
      return false;
    }
    const ordered = [...snapshot.matches].sort((left, right) => left.order - right.order);
    const index = ordered.findIndex((entry) => entry.id === match.id);
    const neighbor = ordered[index + (direction === 'UP' ? -1 : 1)];
    return (
      neighbor !== undefined &&
      neighbor.status === 'PENDING' &&
      !neighbor.isPhantom &&
      !neighbor.isConditional
    );
  }

  protected canStartMatch(match: Match): boolean {
    return (
      this.snapshot()?.tournament.status === 'FIXTURE_GENERATED' &&
      match.status === 'PENDING' &&
      !match.isPhantom &&
      !match.isConditional &&
      this.resolvedMatches().some(
        (resolved) => resolved.matchId === match.id && resolved.isPlayable,
      )
    );
  }

  protected resultLabel(row: FixtureMatchRow): string | null {
    const result = row.match.result;
    return result
      ? `${row.homeLabel} ${result.homePoints}${this.strings.scoreSeparator}${result.awayPoints} ${row.awayLabel}`
      : null;
  }

  protected consecutiveWarning(teamName: string): string {
    return this.strings.consecutiveWarning.replace('{team}', teamName);
  }

  protected formatDuration(totalMinutes: number): string {
    if (totalMinutes <= 60) return `${totalMinutes} ${this.strings.minutes}`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes === 0
      ? `${hours} ${this.strings.hours}`
      : `${hours} ${this.strings.hours} ${minutes} ${this.strings.minutes}`;
  }

  protected formatTime(value: string): string {
    return new Date(value).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }

  protected async generate(): Promise<void> {
    const snapshot = this.snapshot();
    if (!snapshot || this.isBusy()) return;
    if (!this.canModifyFixture) {
      showErrorPopup(this.strings.tournamentLocked);
      return;
    }
    if (this.activeTeams.length < 2) {
      showErrorPopup(this.strings.noTeams);
      return;
    }
    const params = snapshot.tournament.formatParams;
    if (!params) {
      showErrorPopup(this.strings.noFormat);
      return;
    }
    if (
      snapshot.tournament.status === 'FIXTURE_GENERATED' &&
      !window.confirm(this.strings.confirmRegenerate)
    ) {
      return;
    }

    this.isBusy.set(true);
    try {
      const seed = crypto.randomUUID();
      const draws =
        snapshot.tournament.status === 'FIXTURE_GENERATED'
          ? snapshot.draws.filter((draw) => draw.payload.kind === 'TEAMS')
          : snapshot.draws;
      const generated = generateFixture({
        teams: this.activeTeams,
        params,
        draws,
        rng: createSeededRng(seed),
      });
      if (!generated.ok) {
        showErrorPopup(
          generated.error.code === 'unsupportedFormat'
            ? this.strings.unsupportedFormat
            : this.strings.generateFailed,
        );
        return;
      }

      const persisted = assignGeneratedFixtureIds(
        generated.value,
        () => crypto.randomUUID(),
        seed,
        new Date().toISOString(),
      );
      await tournamentRepository.saveFixture({
        formatParams: params,
        ...persisted,
      });
      await this.load();
      this.statusMessage.set(this.strings.generated);
    } catch (error) {
      console.error('Fixture generation failed', error);
      showErrorPopup(
        snapshot.tournament.status === 'FIXTURE_GENERATED'
          ? this.strings.regenerateFailed
          : this.strings.saveFailed,
      );
    } finally {
      this.isBusy.set(false);
    }
  }

  protected async moveMatch(matchId: string, direction: 'UP' | 'DOWN'): Promise<void> {
    const snapshot = this.snapshot();
    if (!snapshot || !this.canModifyFixture || this.isBusy()) return;
    const moved = movePendingMatch(snapshot.matches, matchId, direction);
    if (!moved.ok) {
      showErrorPopup(this.matchOrderErrorMessage(moved.error.messageKey));
      return;
    }
    await this.persistOrders(moved.value);
  }

  protected async resetOrder(): Promise<void> {
    const snapshot = this.snapshot();
    if (!snapshot || !this.canModifyFixture || this.isBusy()) return;
    const reorderableIds = snapshot.matches
      .filter((match) => match.status === 'PENDING' && !match.isPhantom && !match.isConditional)
      .map((match) => match.id);
    const scheduledIds = this.suggestedOrderIds().filter((id) => reorderableIds.includes(id));
    const suggestedIds = [
      ...scheduledIds,
      ...reorderableIds.filter((id) => !scheduledIds.includes(id)),
    ];
    const reset = resetSuggestedMatchOrder(snapshot.matches, suggestedIds);
    if (!reset.ok) {
      showErrorPopup(this.matchOrderErrorMessage(reset.error.messageKey));
      return;
    }
    await this.persistOrders(reset.value, this.strings.orderReset);
  }

  protected async startMatch(match: Match): Promise<void> {
    const snapshot = this.snapshot();
    if (!snapshot || this.isBusy() || !this.canStartMatch(match)) return;
    if (!window.confirm(this.strings.confirmStart)) return;

    this.isBusy.set(true);
    try {
      await tournamentRepository.startMatch(match.id, new Date().toISOString());
      await this.load();
      this.statusMessage.set(this.strings.matchStarted);
    } catch (error) {
      console.error('Starting tournament match failed', error);
      showErrorPopup(this.strings.startFailed);
    } finally {
      this.isBusy.set(false);
    }
  }

  protected openFormat(): void {
    void this.router.navigateByUrl('/panel/formato');
  }

  protected goBack(): void {
    void this.router.navigateByUrl('/panel');
  }

  private async persistOrders(matches: readonly Match[], successMessage?: string): Promise<void> {
    this.isBusy.set(true);
    try {
      await tournamentRepository.updateMatchOrders(
        matches.map((match) => ({ matchId: match.id, order: match.order })),
      );
      await this.load();
      this.statusMessage.set(successMessage ?? null);
    } catch (error) {
      console.error('Match reordering failed', error);
      showErrorPopup(this.strings.orderFailed);
    } finally {
      this.isBusy.set(false);
    }
  }

  private async load(): Promise<void> {
    const snapshot = await tournamentRepository.getSnapshot();
    if (!snapshot) {
      await this.router.navigateByUrl('/bienvenida');
      return;
    }
    this.snapshot.set(snapshot);
    const seed =
      snapshot.draws.find((draw) => draw.payload.kind === 'TIEBREAK')?.seed ?? 'fixture-view';
    const resolvedMatches = resolveMatches(snapshot, createSeededRng(seed));
    this.resolvedMatches.set(resolvedMatches);
    const persistedDetails = computeScheduleDetails(
      snapshot,
      Date.now(),
      resolvedMatches,
      'PERSISTED',
    );
    this.scheduleDetails.set(persistedDetails);
    this.suggestedOrderIds.set(
      computeScheduleDetails(snapshot, Date.now(), resolvedMatches, 'SUGGESTED').orderedMatchIds,
    );
  }

  private referenceLabel(reference: Match['home'], snapshot: TournamentSnapshot): string {
    if (reference.kind === 'TEAM') {
      return (
        snapshot.teams.find((team) => team.id === reference.teamId)?.name ?? this.strings.unresolved
      );
    }
    if (reference.kind === 'GROUP_POSITION') {
      const group = snapshot.groups.find((entry) => entry.id === reference.groupId);
      return this.strings.groupPosition
        .replace('{position}', String(reference.position))
        .replace('{group}', group?.name ?? this.strings.unknownGroup);
    }
    if (reference.kind === 'LEVEL_POSITION') {
      return this.strings.levelPosition
        .replace('{position}', String(reference.position))
        .replace('{level}', String(reference.level));
    }
    if (reference.kind === 'WINNER_OF' || reference.kind === 'LOSER_OF') {
      const relatedMatch = snapshot.matches.find((match) => match.id === reference.matchId);
      const outcome = reference.kind === 'WINNER_OF' ? this.strings.winner : this.strings.loser;
      return `${outcome} ${this.strings.match} ${relatedMatch ? relatedMatch.order : this.strings.unresolved}`;
    }
    return this.strings.unresolved;
  }

  private matchOrderErrorMessage(messageKey: string): string {
    return (
      Object.entries(MATCH_ORDER_STRINGS).find(([key]) => key === messageKey)?.[1] ??
      this.strings.orderBlocked
    );
  }
}
