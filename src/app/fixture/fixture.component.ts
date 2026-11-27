import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tournamentRepository } from '../../data/tournament-repository';
import { computeFormatOption } from '../../domain/format-options';
import { generateFixture } from '../../domain/fixture';
import { movePendingMatch, resetSuggestedMatchOrder } from '../../domain/match-order';
import {
  EditImpact,
  FormatOption,
  Match,
  MatchEvent,
  MatchResult,
  Player,
  ResolvedMatch,
  Stage,
  Team,
  TournamentSnapshot,
} from '../../domain/model';
import { createSeededRng } from '../../domain/rng';
import { computeScheduleDetails, ScheduleDetails } from '../../domain/schedule';
import { getRosterStatus } from '../../domain/team';
import { resolveMatches } from '../../domain/resolve-matches';
import { analyzeEditImpact } from '../../domain/edit-impact';
import { editFinalizedMatch as editFinalizedMatchDomain } from '../../domain/match-control';
import { createFixedClock } from '../../domain/clock';
import { canAddConversion, computeScore } from '../../domain/match-events';
import { FIXTURE_STRINGS } from '../../i18n/fixture-strings';
import { MATCH_ORDER_STRINGS } from '../../i18n/match-order-strings';
import { MATCH_CONTROL_STRINGS } from '../../i18n/match-control-strings';
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
  protected readonly matchControlStrings = MATCH_CONTROL_STRINGS;
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
  protected readonly editingMatchId = signal<string | null>(null);
  protected readonly editMode = signal<MatchResult['mode']>('DIRECT');
  protected readonly editDefinition = signal<MatchResult['definition']>('REGULAR');
  protected readonly editHomePoints = signal(0);
  protected readonly editAwayPoints = signal(0);
  protected readonly editWinnerTeamId = signal<string | null>(null);
  protected readonly editEvents = signal<readonly MatchEvent[]>([]);
  protected readonly pendingResultEdit = signal<{
    readonly matchId: string;
    readonly result: MatchResult;
    readonly events: readonly MatchEvent[];
  } | null>(null);
  protected readonly editImpact = signal<EditImpact | null>(null);
  protected readonly cascadeBackupId = signal<string | null>(null);

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

  protected resultLabel(row: FixtureMatchRow): string | null {
    const result = row.match.result;
    if (!result) return null;
    const score = `${row.homeLabel} ${result.homePoints}${this.strings.scoreSeparator}${result.awayPoints} ${row.awayLabel}`;
    if (result.definition !== 'SUDDEN_DEATH' || !result.winnerTeamId) {
      return score;
    }
    const winnerName =
      this.snapshot()?.teams.find((team) => team.id === result.winnerTeamId)?.name ??
      'Equipo ganador';
    return `${score} (${this.strings.suddenDeath(winnerName)})`;
  }

  protected beginResultEdit(row: FixtureMatchRow): void {
    const snapshot = this.snapshot();
    const result = row.match.result;
    if (
      !snapshot ||
      (snapshot.tournament.status !== 'RUNNING' &&
        snapshot.tournament.status !== 'FINISHED') ||
      row.match.status !== 'FINISHED' ||
      !result ||
      this.isBusy()
    ) {
      return;
    }

    this.editingMatchId.set(row.match.id);
    this.editMode.set(result.mode);
    this.editDefinition.set(result.definition);
    this.editHomePoints.set(result.homePoints);
    this.editAwayPoints.set(result.awayPoints);
    this.editWinnerTeamId.set(result.winnerTeamId);
    const resolved = this.resolvedMatches().find((entry) => entry.matchId === row.match.id);
    const validTeamIds = new Set(
      [resolved?.homeTeamId, resolved?.awayTeamId].filter(
        (teamId): teamId is string => teamId !== null && teamId !== undefined,
      ),
    );
    this.editEvents.set(
      snapshot.events
        .filter((event) => event.matchId === row.match.id)
        .map((event) => {
          if (!validTeamIds.has(event.teamId)) return null;
          const player = event.playerId
            ? snapshot.players.find((candidate) => candidate.id === event.playerId)
            : null;
          return {
            ...event,
            playerId: player?.teamId === event.teamId ? event.playerId : null,
          };
        })
        .filter((event): event is MatchEvent => event !== null),
    );
    this.pendingResultEdit.set(null);
    this.editImpact.set(null);
  }

  protected cancelResultEdit(): void {
    this.editingMatchId.set(null);
    this.editEvents.set([]);
  }

  protected setEditMode(value: string): void {
    if (value === 'DETAIL' || value === 'DIRECT' || value === 'WALKOVER') {
      this.editMode.set(value);
      if (value === 'WALKOVER') {
        this.editDefinition.set('WALKOVER');
      } else if (this.editDefinition() === 'WALKOVER') {
        this.editDefinition.set('REGULAR');
        this.editWinnerTeamId.set(null);
      }
    }
  }

  protected setEditDefinition(value: string): void {
    if (value === 'REGULAR' || value === 'SUDDEN_DEATH' || value === 'WALKOVER') {
      this.editDefinition.set(value);
    }
  }

  protected setEditWinner(value: string): void {
    this.editWinnerTeamId.set(value || null);
  }

  protected setEditScore(side: 'home' | 'away', value: string): void {
    const score = value.trim() === '' ? Number.NaN : Number(value);
    if (side === 'home') {
      this.editHomePoints.set(score);
    } else {
      this.editAwayPoints.set(score);
    }
  }

  protected updateEditEventType(eventId: string, value: string): void {
    if (value !== 'TRY' && value !== 'CONVERSION') return;
    this.editEvents.update((events) =>
      events.map((event) => (event.id === eventId ? { ...event, type: value } : event)),
    );
  }

  protected updateEditEventTeam(eventId: string, teamId: string): void {
    this.editEvents.update((events) =>
      events.map((event) =>
        event.id === eventId
          ? { ...event, teamId, playerId: event.teamId === teamId ? event.playerId : null }
          : event,
      ),
    );
  }

  protected updateEditEventAuthor(eventId: string, playerId: string): void {
    this.editEvents.update((events) =>
      events.map((event) => {
        if (event.id !== eventId) return event;
        if (!playerId) return { ...event, playerId: null };
        const player = this.snapshot()?.players.find((candidate) => candidate.id === playerId);
        return player?.teamId === event.teamId ? { ...event, playerId } : event;
      }),
    );
  }

  protected removeEditEvent(eventId: string): void {
    this.editEvents.update((events) => events.filter((event) => event.id !== eventId));
  }

  protected addEditEvent(matchId: string, teamId: string | null, type: MatchEvent['type']): void {
    if (!teamId) return;
    const event: MatchEvent = {
      id: crypto.randomUUID(),
      matchId,
      teamId,
      type,
      playerId: null,
      createdAt: new Date().toISOString(),
    };
    this.editEvents.update((events) => [...events, event]);
  }

  protected canAddEditConversion(teamId: string | null): boolean {
    return !!teamId && canAddConversion(this.editEvents(), teamId);
  }

  protected playersForEventTeam(teamId: string): readonly Player[] {
    return this.snapshot()?.players.filter((player) => player.teamId === teamId) ?? [];
  }

  protected playerName(player: Player): string {
    return `${player.firstName} ${player.lastName}${player.disambiguation ?? ''}`;
  }

  protected teamName(teamId: string | null): string {
    return (
      this.snapshot()?.teams.find((team) => team.id === teamId)?.name ?? this.strings.unresolvedTeam
    );
  }

  protected matchTeamId(matchId: string, side: 'home' | 'away'): string | null {
    const resolved = this.resolvedMatches().find((entry) => entry.matchId === matchId);
    return side === 'home' ? (resolved?.homeTeamId ?? null) : (resolved?.awayTeamId ?? null);
  }

  protected affectedMatchLabel(matchId: string): string {
    const match = this.snapshot()?.matches.find((entry) => entry.id === matchId);
    return match?.label ?? this.strings.matchNumber.replace('{number}', String(match?.order ?? ''));
  }

  protected teamsBeforeAfter(affected: EditImpact['affected'][number]): string {
    return this.strings.teamsBeforeAfter
      .replace('{beforeHome}', this.teamName(affected.beforeHomeTeamId))
      .replace('{beforeAway}', this.teamName(affected.beforeAwayTeamId))
      .replace('{afterHome}', this.teamName(affected.afterHomeTeamId))
      .replace('{afterAway}', this.teamName(affected.afterAwayTeamId));
  }

  protected async reviewResultEdit(row: FixtureMatchRow): Promise<void> {
    const snapshot = this.snapshot();
    const resolved = this.resolvedMatches().find((entry) => entry.matchId === row.match.id);
    if (
      !snapshot ||
      !resolved?.homeTeamId ||
      !resolved.awayTeamId ||
      this.isBusy() ||
      this.editingMatchId() !== row.match.id
    ) {
      return;
    }

    const events = this.editMode() === 'DETAIL' ? this.editEvents() : [];
    let homePoints = this.editHomePoints();
    let awayPoints = this.editAwayPoints();
    if (this.editMode() === 'DETAIL') {
      const score = computeScore(events, resolved.homeTeamId, resolved.awayTeamId);
      if (!score.ok) {
        showErrorPopup(this.strings.resultEditInvalid);
        return;
      }
      homePoints = score.value.home;
      awayPoints = score.value.away;
    }
    const result: MatchResult = {
      mode: this.editMode(),
      homePoints,
      awayPoints,
      definition: this.editDefinition(),
      winnerTeamId: this.editWinnerTeamId(),
    };
    const validated = editFinalizedMatchDomain(
      snapshot,
      this.resolvedMatches(),
      row.match.id,
      result,
      events,
      createFixedClock(Date.now()),
    );
    if (!validated.ok) {
      showErrorPopup(this.strings.resultEditInvalid);
      return;
    }

    const after: TournamentSnapshot = {
      ...snapshot,
      matches: snapshot.matches.map((match) =>
        match.id === row.match.id ? validated.value.match : match,
      ),
      events: [
        ...snapshot.events.filter((event) => event.matchId !== row.match.id),
        ...validated.value.events,
      ],
    };
    const impact = analyzeEditImpact(snapshot, after);
    if (impact.affected.length === 0) {
      await this.persistResultEdit(row.match.id, result, events, []);
      return;
    }
    this.pendingResultEdit.set({ matchId: row.match.id, result, events });
    this.editImpact.set(impact);
  }

  protected cancelCascadeConfirmation(): void {
    this.pendingResultEdit.set(null);
    this.editImpact.set(null);
  }

  protected async confirmCascadeEdit(): Promise<void> {
    const pending = this.pendingResultEdit();
    const impact = this.editImpact();
    if (!pending || !impact) return;
    await this.persistResultEdit(
      pending.matchId,
      pending.result,
      pending.events,
      impact.affected.map((entry) => entry.matchId),
    );
  }

  protected async undoCascadeEdit(): Promise<void> {
    const backupId = this.cascadeBackupId();
    if (!backupId || this.isBusy()) return;
    if (!window.confirm(this.strings.confirmUndoCascadeEdit)) return;
    this.isBusy.set(true);
    try {
      await tournamentRepository.restoreCascadeEdit(backupId, new Date().toISOString());
      this.cascadeBackupId.set(null);
      await this.load();
      this.statusMessage.set(this.strings.cascadeEditUndone);
    } catch (error) {
      console.error('Restoring cascade edit failed', error);
      showErrorPopup(this.strings.undoCascadeEditFailed);
    } finally {
      this.isBusy.set(false);
    }
  }

  private async persistResultEdit(
    matchId: string,
    result: MatchResult,
    events: readonly MatchEvent[],
    expectedAffectedMatchIds: readonly string[],
  ): Promise<void> {
    if (this.isBusy()) return;
    this.isBusy.set(true);
    try {
      const backupId = await tournamentRepository.editFinalizedMatch({
        matchId,
        result,
        events,
        expectedAffectedMatchIds,
        changedAt: new Date().toISOString(),
      });
      this.cascadeBackupId.set(backupId);
      this.pendingResultEdit.set(null);
      this.editImpact.set(null);
      this.editingMatchId.set(null);
      this.editEvents.set([]);
      await this.load();
      this.statusMessage.set(
        backupId ? this.strings.cascadeEditSaved : this.strings.resultEditSaved,
      );
    } catch (error) {
      console.error('Editing finalized match failed', error);
      const staleImpact =
        error instanceof Error && error.message.startsWith('Match edit impact changed');
      showErrorPopup(
        staleImpact ? this.strings.resultEditImpactChanged : this.strings.resultEditFailed,
      );
      await this.load();
    } finally {
      this.isBusy.set(false);
    }
  }

  protected async undoWalkover(row: FixtureMatchRow): Promise<void> {
    const snapshot = this.snapshot();
    const result = row.match.result;
    if (
      !snapshot ||
      (snapshot.tournament.status !== 'RUNNING' &&
        snapshot.tournament.status !== 'FINISHED') ||
      row.match.status !== 'FINISHED' ||
      result?.mode !== 'WALKOVER' ||
      this.isBusy()
    ) {
      return;
    }

    if (
      !window.confirm(
        MATCH_CONTROL_STRINGS.confirmUndoWalkover(
          row.homeLabel,
          result.homePoints,
          result.awayPoints,
          row.awayLabel,
        ),
      )
    ) {
      return;
    }

    this.isBusy.set(true);
    try {
      await tournamentRepository.undoMatchWalkover(row.match.id, new Date().toISOString());
      await this.load();
      this.statusMessage.set(MATCH_CONTROL_STRINGS.walkoverUndone);
    } catch (error) {
      console.error('Undoing match walkover failed', error);
      showErrorPopup(MATCH_CONTROL_STRINGS.undoWalkoverFailed);
    } finally {
      this.isBusy.set(false);
    }
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
