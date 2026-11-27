import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { Router } from '@angular/router';
import { spikeDatabase, SpikeRecord } from '../../data/spike-database';
import { tournamentRepository } from '../../data/tournament-repository';
import { Tournament } from '../../domain/model';
import { PERSISTENCE_STRINGS } from '../../i18n/persistence-strings';
import { SPIKE_STRINGS } from '../../i18n/spike-strings';
import { ProjectorChannel } from '../../sync/projector-channel';
import { showErrorPopup } from '../error-popup';
import { MATCH_CONTROL_STRINGS } from '../../i18n/match-control-strings';
import { SETTINGS_STRINGS } from '../../i18n/settings-strings';
import { TOURNAMENT_CLOSE_STRINGS } from '../../i18n/tournament-close-strings';
import {
  Match,
  MatchEvent,
  ResolvedMatch,
  TournamentSnapshot,
} from '../../domain/model';
import {
  canCloseTournament,
  computeFinalTournamentResult,
  FinalTournamentResult,
} from '../../domain/tournament-close';
import { resolveMatches } from '../../domain/resolve-matches';
import { createSeededRng } from '../../domain/rng';
import { computeScheduleDetails, ScheduleDetails } from '../../domain/schedule';
import {
  buildMatchControlView,
  MatchControlView,
  undoMatchInProgress,
} from '../../domain/match-control';
import {
  addMatchEvent,
  computeScore,
  removeMatchEvent,
  canAddConversion,
  isScoreReachable,
} from '../../domain/match-events';

@Component({
  selector: 'app-panel',
  templateUrl: './panel.component.html',
  styleUrl: './panel.component.css',
})
export class PanelComponent implements OnInit {
  private readonly router = inject(Router);
  protected readonly persistenceStrings = PERSISTENCE_STRINGS;
  private readonly swUpdate = inject(SwUpdate);
  private readonly projectorChannel = new ProjectorChannel();
  private readonly destroyRef = inject(DestroyRef);

  protected readonly strings = SPIKE_STRINGS;
  protected readonly lastRecord = signal<SpikeRecord | null>(null);
  protected readonly persistenceStatus = signal<string>(SPIKE_STRINGS.persistenceUnsupported);
  protected readonly offlineStatus = signal<string>(SPIKE_STRINGS.offlinePending);
  protected readonly savedAt = signal<string | null>(null);
  protected readonly tournament = signal<Tournament | null>(null);
  protected readonly startBusy = signal(false);
  protected readonly statusMessage = signal<string | null>(null);
  protected readonly matchControlStrings = MATCH_CONTROL_STRINGS;
  protected readonly settingsStrings = SETTINGS_STRINGS;
  protected readonly snapshot = signal<TournamentSnapshot | null>(null);
  protected readonly resolvedMatches = signal<readonly ResolvedMatch[]>([]);
  protected readonly scheduleDetails = signal<ScheduleDetails>({
    entries: [],
    orderedMatchIds: [],
    minimumRestByTeam: [],
    consecutiveAppearances: [],
  });
  protected readonly matchControl = signal<MatchControlView>({
    current: null,
    next: null,
    following: [],
  });
  protected readonly homePlayerSearch = signal('');
  protected readonly awayPlayerSearch = signal('');
  protected readonly homePlayerId = signal<string | null>(null);
  protected readonly awayPlayerId = signal<string | null>(null);
  protected readonly activePlayerSearch = signal<'home' | 'away' | null>(null);
  protected readonly eventBusy = signal(false);
  protected readonly directMode = signal(false);
  protected readonly directHomeScore = signal(0);
  protected readonly directAwayScore = signal(0);
  protected readonly walkoverMatchId = signal<string | null>(null);
  protected readonly tournamentCloseStrings = TOURNAMENT_CLOSE_STRINGS;
  protected readonly canClose = signal(false);
  protected readonly finalResult = signal<FinalTournamentResult | null>(null);

  async ngOnInit(): Promise<void> {
    this.destroyRef.onDestroy(() => this.projectorChannel.close());
    await this.loadLastRecord();
    this.tournament.set(await tournamentRepository.getTournament());
    await this.loadMatchControl();
    await this.requestPersistentStorage();
    this.checkOfflineStatus();
  }

  protected async saveTest(): Promise<void> {
    try {
      const record: SpikeRecord = {
        message: `Prueba guardada a las ${new Date().toLocaleTimeString('es-AR')}`,
        createdAt: new Date().toISOString(),
      };
      await spikeDatabase.transaction('rw', spikeDatabase.spikeRecords, async () => {
        await spikeDatabase.spikeRecords.add(record);
      });
      await tournamentRepository.touchTournament();
      await this.loadLastRecord();
      this.savedAt.set(
        new Date().toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      );
      this.projectorChannel.publish(record.message);
    } catch {
      showErrorPopup(PERSISTENCE_STRINGS.saveFailed);
    }
  }

  protected async startTournament(): Promise<void> {
    if (this.tournament()?.status !== 'FIXTURE_GENERATED' || this.startBusy()) return;
    if (!window.confirm(this.strings.confirmTournamentStart)) return;

    this.startBusy.set(true);
    try {
      await tournamentRepository.startTournament(new Date().toISOString());
      this.tournament.set(await tournamentRepository.getTournament());
      this.statusMessage.set(this.strings.tournamentStarted);
    } catch (error) {
      console.error('Starting tournament failed', error);
      showErrorPopup(this.strings.startTournamentFailed);
    } finally {
      this.startBusy.set(false);
    }
  }

  protected async putMatchInPlay(matchId: string): Promise<void> {
    if (this.startBusy()) return;
    if (this.matchControl().current !== null) {
      showErrorPopup(MATCH_CONTROL_STRINGS.alreadyInProgress);
      return;
    }
    this.startBusy.set(true);
    try {
      await tournamentRepository.setMatchInProgress(matchId, new Date().toISOString());
      await this.loadMatchControl();
      this.statusMessage.set(MATCH_CONTROL_STRINGS.matchStarted);
    } catch (error) {
      console.error('Starting match failed', error);
      showErrorPopup(MATCH_CONTROL_STRINGS.startFailed);
    } finally {
      this.startBusy.set(false);
    }
  }

  protected async undoMatchInProgress(matchId: string): Promise<void> {
    if (this.startBusy() || this.eventBusy()) return;
    if (!window.confirm(MATCH_CONTROL_STRINGS.confirmUndoInProgress)) return;

    const snapshot = this.snapshot();
    if (!snapshot) return;

    const eventsExist = snapshot.events.some((event) => event.matchId === matchId);
    const preserveEvents =
      !eventsExist || window.confirm(MATCH_CONTROL_STRINGS.confirmPreserveEvents);
    const preview = undoMatchInProgress(snapshot, matchId, preserveEvents);
    if (!preview.ok) {
      showErrorPopup(MATCH_CONTROL_STRINGS.undoInProgressFailed);
      return;
    }

    const resetTournament =
      preview.value.shouldOfferFixtureReset &&
      window.confirm(MATCH_CONTROL_STRINGS.confirmFixtureReset);

    this.startBusy.set(true);
    try {
      await tournamentRepository.undoMatchInProgress(
        matchId,
        preserveEvents,
        resetTournament,
        new Date().toISOString(),
      );
      await this.loadMatchControl();
      const next = this.matchControl().next;
      this.projectorChannel.publish(
        next
          ? `${next.resolved.homeLabel} - ${next.resolved.awayLabel}`
          : MATCH_CONTROL_STRINGS.noNextMatch,
      );
      this.statusMessage.set(MATCH_CONTROL_STRINGS.inProgressUndone);
    } catch (error) {
      console.error('Undoing in-progress match failed', error);
      showErrorPopup(MATCH_CONTROL_STRINGS.undoInProgressFailed);
    } finally {
      this.startBusy.set(false);
    }
  }

  protected beginWalkover(matchId: string): void {
    this.walkoverMatchId.set(this.walkoverMatchId() === matchId ? null : matchId);
  }

  protected get walkoverEntry(): NonNullable<MatchControlView['current']> | null {
    const matchId = this.walkoverMatchId();
    if (!matchId) return null;

    const control = this.matchControl();
    return control.current?.match.id === matchId
      ? control.current
      : control.next?.match.id === matchId
        ? control.next
        : (control.following.find((candidate) => candidate.match.id === matchId) ?? null);
  }

  protected isDoubleWithdrawn(resolved: ResolvedMatch): boolean {
    const teams = this.snapshot()?.teams ?? [];
    return (
      resolved.homeTeamId !== null &&
      resolved.awayTeamId !== null &&
      teams.some((team) => team.id === resolved.homeTeamId && team.status === 'WITHDRAWN') &&
      teams.some((team) => team.id === resolved.awayTeamId && team.status === 'WITHDRAWN')
    );
  }

  protected cancelWalkover(): void {
    this.walkoverMatchId.set(null);
  }

  protected async recordWalkover(matchId: string, absentSide: 'home' | 'away'): Promise<void> {
    if (this.eventBusy() || this.startBusy()) return;
    const snapshot = this.snapshot();
    const control = this.matchControl();
    const entry =
      control.current?.match.id === matchId
        ? control.current
        : control.next?.match.id === matchId
          ? control.next
          : control.following.find((candidate) => candidate.match.id === matchId);
    if (
      !snapshot ||
      !entry ||
      !entry.resolved.homeTeamId ||
      !entry.resolved.awayTeamId
    ) {
      return;
    }

    const absentTeamId =
      absentSide === 'home' ? entry.resolved.homeTeamId : entry.resolved.awayTeamId;
    const absentName =
      absentSide === 'home' ? entry.resolved.homeLabel : entry.resolved.awayLabel;
    const winnerName =
      absentSide === 'home' ? entry.resolved.awayLabel : entry.resolved.homeLabel;
    const { winner, loser } = snapshot.tournament.rules.walkoverScore;
    if (
      !window.confirm(
        MATCH_CONTROL_STRINGS.confirmWalkover(
          absentName,
          winnerName,
          winner,
          loser,
          snapshot.events.some((event) => event.matchId === matchId),
        ),
      )
    ) {
      return;
    }

    this.eventBusy.set(true);
    try {
      await tournamentRepository.finishMatchWalkover(
        matchId,
        absentTeamId,
        new Date().toISOString(),
      );
      await this.loadMatchControl();
      this.walkoverMatchId.set(null);
      this.statusMessage.set(MATCH_CONTROL_STRINGS.walkoverRecorded);
    } catch (error) {
      console.error('Recording match walkover failed', error);
      showErrorPopup(MATCH_CONTROL_STRINGS.walkoverFailed);
    } finally {
      this.eventBusy.set(false);
    }
  }

  protected async finishControlMatch(matchId: string, suddenDeathWinnerTeamId?: string): Promise<void> {
    if (this.eventBusy() || this.startBusy()) return;
    const snapshot = this.snapshot();
    const current = this.matchControl().current;
    if (!snapshot || !current || current.match.id !== matchId) return;
    if (!current.resolved.homeTeamId || !current.resolved.awayTeamId) return;

    if (this.directMode()) {
      await this.finishDirectControlMatch(matchId, current, suddenDeathWinnerTeamId);
      return;
    }

    const score = this.liveScore();
    if (!score) {
      showErrorPopup(MATCH_CONTROL_STRINGS.eventSaveFailed);
      return;
    }

    const stage = snapshot.stages.find((candidate) => candidate.id === current.match.stageId);
    const isElimination =
      stage?.type === 'KNOCKOUT' ||
      stage?.type === 'CUP' ||
      stage?.type === 'WINNERS_BRACKET' ||
      stage?.type === 'LOSERS_BRACKET' ||
      stage?.type === 'GRAND_FINAL';
    if (isElimination && score.home === score.away && !suddenDeathWinnerTeamId) {
      showErrorPopup(MATCH_CONTROL_STRINGS.eliminationTie);
      return;
    }

    const confirmation =
      suddenDeathWinnerTeamId
        ? MATCH_CONTROL_STRINGS.confirmSuddenDeath(
            suddenDeathWinnerTeamId === current.resolved.homeTeamId
              ? current.resolved.homeLabel
              : current.resolved.awayLabel,
            score.home,
            score.away,
          )
        : MATCH_CONTROL_STRINGS.confirmDetailFinish(
            current.resolved.homeLabel,
            score.home,
            score.away,
            current.resolved.awayLabel,
          );
    if (!window.confirm(confirmation)) return;

    this.eventBusy.set(true);
    try {
      const events = this.eventsForMatch(matchId);
      await tournamentRepository.finishMatchWithEvents(
        matchId,
        events,
        new Date().toISOString(),
        suddenDeathWinnerTeamId ?? null,
      );
      await this.loadMatchControl();
      this.statusMessage.set(MATCH_CONTROL_STRINGS.matchFinished);
    } catch (error) {
      console.error('Finishing match failed', error);
      showErrorPopup(MATCH_CONTROL_STRINGS.finishFailed);
    } finally {
      this.eventBusy.set(false);
    }
  }

  protected toggleDirectMode(): void {
    if (!this.directMode() && this.eventsForMatch(this.matchControl().current?.match.id ?? '').length > 0) {
      if (!window.confirm(MATCH_CONTROL_STRINGS.confirmDiscardEvents)) return;
    }
    this.directMode.set(!this.directMode());
  }

  protected setDirectScore(side: 'home' | 'away', value: string): void {
    const parsed = Number(value);
    if (side === 'home') {
      this.directHomeScore.set(Number.isFinite(parsed) ? parsed : 0);
    } else {
      this.directAwayScore.set(Number.isFinite(parsed) ? parsed : 0);
    }
  }

  private async finishDirectControlMatch(
    matchId: string,
    current: NonNullable<MatchControlView['current']>,
    suddenDeathWinnerTeamId?: string,
  ): Promise<void> {
    const homePoints = this.directHomeScore();
    const awayPoints = this.directAwayScore();
    if (
      !Number.isInteger(homePoints) ||
      !Number.isInteger(awayPoints) ||
      homePoints < 0 ||
      awayPoints < 0
    ) {
      showErrorPopup(MATCH_CONTROL_STRINGS.invalidDirectScore);
      return;
    }

    if (!isScoreReachable(homePoints) || !isScoreReachable(awayPoints)) {
      window.alert(MATCH_CONTROL_STRINGS.unreachableScore);
    }

    const snapshot = this.snapshot();
    if (snapshot) {
      const stage = snapshot.stages.find((candidate) => candidate.id === current.match.stageId);
      const isElimination =
        stage?.type === 'KNOCKOUT' ||
        stage?.type === 'CUP' ||
        stage?.type === 'WINNERS_BRACKET' ||
        stage?.type === 'LOSERS_BRACKET' ||
        stage?.type === 'GRAND_FINAL';
      if (isElimination && homePoints === awayPoints && !suddenDeathWinnerTeamId) {
        showErrorPopup(MATCH_CONTROL_STRINGS.eliminationTie);
        return;
      }
    }

    const confirmation =
      suddenDeathWinnerTeamId
        ? MATCH_CONTROL_STRINGS.confirmSuddenDeath(
            suddenDeathWinnerTeamId === current.resolved.homeTeamId
              ? current.resolved.homeLabel
              : current.resolved.awayLabel,
            homePoints,
            awayPoints,
          )
        : MATCH_CONTROL_STRINGS.confirmDirectFinish(
            current.resolved.homeLabel,
            homePoints,
            awayPoints,
            current.resolved.awayLabel,
          );
    if (!window.confirm(confirmation)) return;

    this.eventBusy.set(true);
    try {
      await tournamentRepository.finishMatchDirect(
        matchId,
        homePoints,
        awayPoints,
        new Date().toISOString(),
        suddenDeathWinnerTeamId ?? null,
      );
      await this.loadMatchControl();
      this.directMode.set(false);
      const updatedSnapshot = this.snapshot();
      const usesTriesFor =
        updatedSnapshot?.tournament.rules.tiebreakers.includes('TRIES_FOR') === true;
      if (usesTriesFor) {
        const directMatchCount =
          (updatedSnapshot?.matches.filter((match) => match.result?.mode === 'DIRECT').length ?? 0);
        this.statusMessage.set(MATCH_CONTROL_STRINGS.triesIncompleteWarning(directMatchCount));
      } else {
        this.statusMessage.set(MATCH_CONTROL_STRINGS.matchFinished);
      }
    } catch (error) {
      console.error('Finishing direct match failed', error);
      showErrorPopup(MATCH_CONTROL_STRINGS.finishFailed);
    } finally {
      this.eventBusy.set(false);
    }
  }

  protected async addMatchEvent(teamId: string, type: MatchEvent['type']): Promise<void> {
    if (this.eventBusy()) return;
    const current = this.matchControl().current;
    const snapshot = this.snapshot();
    if (!current || !snapshot) return;
    if (!current.resolved.homeTeamId || !current.resolved.awayTeamId) return;

    const events = this.eventsForMatch(current.match.id);
    if (type === 'CONVERSION' && !canAddConversion(events, teamId)) {
      showErrorPopup(MATCH_CONTROL_STRINGS.conversionUnavailable);
      return;
    }

    const playerId =
      teamId === current.resolved.homeTeamId
        ? this.homePlayerId()
        : this.awayPlayerId();
    const event: MatchEvent = {
      id: crypto.randomUUID(),
      matchId: current.match.id,
      teamId,
      type,
      playerId,
      createdAt: new Date().toISOString(),
    };
    const result = addMatchEvent(
      events,
      event,
      current.resolved.homeTeamId,
      current.resolved.awayTeamId,
      snapshot.players,
    );
    if (!result.ok) {
      showErrorPopup(MATCH_CONTROL_STRINGS.eventSaveFailed);
      return;
    }

    this.eventBusy.set(true);
    try {
      await tournamentRepository.saveMatchWithEvents({
        match: current.match,
        events: result.value,
      });
      await this.loadMatchControl();
      this.statusMessage.set(MATCH_CONTROL_STRINGS.eventSaved);
    } catch (error) {
      console.error('Adding match event failed', error);
      showErrorPopup(MATCH_CONTROL_STRINGS.eventSaveFailed);
    } finally {
      this.eventBusy.set(false);
    }
  }

  protected async undoMatchEvent(eventId: string): Promise<void> {
    if (this.eventBusy()) return;
    const current = this.matchControl().current;
    if (!current) return;
    if (!current.resolved.homeTeamId || !current.resolved.awayTeamId) return;

    const events = this.eventsForMatch(current.match.id);
    const result = removeMatchEvent(
      events,
      eventId,
      current.resolved.homeTeamId,
      current.resolved.awayTeamId,
    );
    if (!result.ok) {
      showErrorPopup(MATCH_CONTROL_STRINGS.eventRemoveFailed);
      return;
    }

    this.eventBusy.set(true);
    try {
      await tournamentRepository.saveMatchWithEvents({
        match: current.match,
        events: result.value,
      });
      await this.loadMatchControl();
      this.statusMessage.set(MATCH_CONTROL_STRINGS.eventRemoved);
    } catch (error) {
      console.error('Removing match event failed', error);
      showErrorPopup(MATCH_CONTROL_STRINGS.eventRemoveFailed);
    } finally {
      this.eventBusy.set(false);
    }
  }

  protected liveScore(): { readonly home: number; readonly away: number } | null {
    const current = this.matchControl().current;
    if (!current) return null;
    if (!current.resolved.homeTeamId || !current.resolved.awayTeamId) return null;
    const score = computeScore(
      this.eventsForMatch(current.match.id),
      current.resolved.homeTeamId,
      current.resolved.awayTeamId,
    );
    return score.ok ? score.value : null;
  }

  protected isEliminationMatch(match: Match): boolean {
    const snapshot = this.snapshot();
    const stage = snapshot?.stages.find((candidate) => candidate.id === match.stageId);
    return (
      stage?.type === 'KNOCKOUT' ||
      stage?.type === 'CUP' ||
      stage?.type === 'WINNERS_BRACKET' ||
      stage?.type === 'LOSERS_BRACKET' ||
      stage?.type === 'GRAND_FINAL'
    );
  }

  protected isLiveTie(): boolean {
    if (this.directMode()) {
      return this.directHomeScore() === this.directAwayScore();
    }
    const score = this.liveScore();
    return score !== null && score.home === score.away;
  }

  protected eventsForMatch(matchId: string): readonly MatchEvent[] {
    return this.snapshot()?.events.filter((event) => event.matchId === matchId) ?? [];
  }

  protected matchContextLabel(match: Match): string | null {
    const snapshot = this.snapshot();
    if (!snapshot) return null;

    const stage = snapshot.stages.find((candidate) => candidate.id === match.stageId);
    const group = match.groupId
      ? snapshot.groups.find((candidate) => candidate.id === match.groupId)
      : null;
    const labels = [
      stage?.name,
      group
        ? MATCH_CONTROL_STRINGS.groupLabel.replace('{name}', group.name)
        : null,
    ].filter((label): label is string => label !== null && label !== undefined);

    return labels.length > 0 ? labels.join(' · ') : null;
  }

  protected playersForTeam(teamId: string, side: 'home' | 'away'): readonly {
    readonly id: string;
    readonly name: string;
  }[] {
    const search =
      (side === 'home' ? this.homePlayerSearch() : this.awayPlayerSearch())
        .trim()
        .toLocaleLowerCase('es');
    return (this.snapshot()?.players ?? [])
      .filter((player) => player.teamId === teamId)
      .filter((player) => {
        if (!search) return true;
        return `${player.firstName} ${player.lastName}`
          .toLocaleLowerCase('es')
          .includes(search);
      })
      .map((player) => ({
        id: player.id,
        name: `${player.firstName} ${player.lastName}${player.disambiguation ? ` (${player.disambiguation})` : ''}`,
      }));
  }

  protected playerSearchValue(side: 'home' | 'away'): string {
    const search = side === 'home' ? this.homePlayerSearch() : this.awayPlayerSearch();
    if (search) return search;

    const playerId = side === 'home' ? this.homePlayerId() : this.awayPlayerId();
    if (!playerId) return '';
    const player = this.snapshot()?.players.find((candidate) => candidate.id === playerId);
    return player
      ? `${player.firstName} ${player.lastName}${player.disambiguation ? ` (${player.disambiguation})` : ''}`
      : '';
  }

  protected openPlayerSearch(side: 'home' | 'away'): void {
    this.activePlayerSearch.set(side);
    if (side === 'home') {
      this.homePlayerSearch.set('');
    } else {
      this.awayPlayerSearch.set('');
    }
  }

  protected updatePlayerSearch(side: 'home' | 'away', value: string): void {
    this.activePlayerSearch.set(side);
    if (side === 'home') {
      this.homePlayerSearch.set(value);
    } else {
      this.awayPlayerSearch.set(value);
    }
  }

  protected selectPlayer(side: 'home' | 'away', playerId: string | null): void {
    this.activePlayerSearch.set(null);
    if (side === 'home') {
      this.homePlayerId.set(playerId);
      this.homePlayerSearch.set('');
    } else {
      this.awayPlayerId.set(playerId);
      this.awayPlayerSearch.set('');
    }
  }

  protected eventLabel(event: MatchEvent): string {
    if (!event.playerId) return MATCH_CONTROL_STRINGS.noAuthor;
    const player = this.snapshot()?.players.find((candidate) => candidate.id === event.playerId);
    return player
      ? `${player.firstName} ${player.lastName}${player.disambiguation ? ` (${player.disambiguation})` : ''}`
      : MATCH_CONTROL_STRINGS.noAuthor;
  }

  protected canConvert(teamId: string): boolean {
    const current = this.matchControl().current;
    if (!current || !teamId) return false;
    return canAddConversion(this.eventsForMatch(current.match.id), teamId);
  }

  protected tentativeStart(matchId: string): string | null {
    const entry = this.scheduleDetails().entries.find((candidate) => candidate.matchId === matchId);
    if (!entry) return null;
    const date = new Date(entry.estimatedStart);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }

  protected openProjector(): void {
    const target = new URL('#/proyector', window.location.href);
    const projector = window.open(target.href, 'fast-seven-projector', 'popup=yes');
    if (projector === null) {
      showErrorPopup(this.strings.popupBlocked);
    }
  }

  protected openPlayers(): void {
    void this.router.navigateByUrl('/jugadores');
  }

  protected openTeams(): void {
    void this.router.navigateByUrl('/equipos');
  }

  protected openRules(): void {
    void this.router.navigateByUrl('/panel/reglas');
  }

  protected openFormat(): void {
    void this.router.navigateByUrl('/panel/formato');
  }

  protected openFixture(): void {
    void this.router.navigateByUrl('/panel/fixture');
  }

  protected openSettings(): void {
    void this.router.navigateByUrl('/panel/ajustes');
  }

  protected teamName(teamId: string): string {
    return this.snapshot()?.teams.find((team) => team.id === teamId)?.name ?? teamId;
  }

  protected playerName(playerId: string): string {
    const player = this.snapshot()?.players.find((candidate) => candidate.id === playerId);
    return player ? `${player.firstName} ${player.lastName}` : playerId;
  }

  protected async closeTournament(): Promise<void> {
    if (!this.canClose() || this.startBusy()) return;
    if (!window.confirm(TOURNAMENT_CLOSE_STRINGS.confirmCloseTournament)) return;
    this.startBusy.set(true);
    try {
      await tournamentRepository.closeTournament(new Date().toISOString());
      await this.loadMatchControl();
      this.statusMessage.set(TOURNAMENT_CLOSE_STRINGS.tournamentFinished);
    } catch (error) {
      console.error('Closing tournament failed', error);
      showErrorPopup(TOURNAMENT_CLOSE_STRINGS.closeFailed);
    } finally {
      this.startBusy.set(false);
    }
  }

  private async loadMatchControl(): Promise<void> {
    const snapshot = await tournamentRepository.getSnapshot();
    this.snapshot.set(snapshot);
    this.tournament.set(snapshot?.tournament ?? null);
    this.canClose.set(snapshot ? canCloseTournament(snapshot) : false);
    this.finalResult.set(
      snapshot?.tournament.status === 'FINISHED'
        ? computeFinalTournamentResult(snapshot)
        : null,
    );
    if (!snapshot) {
      this.canClose.set(false);
      this.finalResult.set(null);
      this.resolvedMatches.set([]);
      this.scheduleDetails.set({
        entries: [],
        orderedMatchIds: [],
        minimumRestByTeam: [],
        consecutiveAppearances: [],
      });
      this.matchControl.set({ current: null, next: null, following: [] });
      return;
    }

    const seed =
      snapshot.draws.find((draw) => draw.payload.kind === 'TIEBREAK')?.seed ?? 'match-control';
    const resolved = resolveMatches(snapshot, createSeededRng(seed));
    this.resolvedMatches.set(resolved);
    const schedule = computeScheduleDetails(snapshot, Date.now(), resolved, 'PERSISTED');
    this.scheduleDetails.set(schedule);
    this.matchControl.set(buildMatchControlView(snapshot, resolved, schedule.orderedMatchIds));
  }

  private async loadLastRecord(): Promise<void> {
    const record = await spikeDatabase.spikeRecords.orderBy('createdAt').last();
    this.lastRecord.set(record ?? null);
  }

  private async requestPersistentStorage(): Promise<void> {
    if (!navigator.storage?.persist) {
      this.persistenceStatus.set(SPIKE_STRINGS.persistenceUnsupported);
      localStorage.setItem('fast-seven-persistence-result', 'unsupported');
      return;
    }

    const granted = await navigator.storage.persist();
    const status = granted ? SPIKE_STRINGS.persistenceGranted : SPIKE_STRINGS.persistenceDenied;
    this.persistenceStatus.set(status);
    localStorage.setItem('fast-seven-persistence-result', granted ? 'granted' : 'denied');
  }

  private checkOfflineStatus(): void {
    if (!this.swUpdate.isEnabled) {
      this.offlineStatus.set(SPIKE_STRINGS.offlineDevelopment);
      return;
    }

    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.ready
        .then((registration) => {
          if (registration.active) {
            this.offlineStatus.set(SPIKE_STRINGS.offlineReady);
          }
        })
        .catch(() => undefined);
    }

    void this.swUpdate
      .checkForUpdate()
      .then(() => {
        this.offlineStatus.set(SPIKE_STRINGS.offlineReady);
      })
      .catch(() => undefined);
  }
}
