import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { Router } from '@angular/router';
import { spikeDatabase, SpikeRecord } from '../../data/spike-database';
import { tournamentRepository } from '../../data/tournament-repository';
import { Tournament } from '../../domain/model';
import { PERSISTENCE_STRINGS } from '../../i18n/persistence-strings';
import {
  PROJECTOR_PANEL_STRINGS,
  PROJECTOR_VIEW_TITLES,
} from '../../i18n/projector-panel-strings';
import { SPIKE_STRINGS } from '../../i18n/spike-strings';
import { ProjectorChannel } from '../../sync/projector-channel';
import { showErrorPopup } from '../error-popup';
import { MATCH_CONTROL_STRINGS } from '../../i18n/match-control-strings';
import { SETTINGS_STRINGS } from '../../i18n/settings-strings';
import { TOURNAMENT_CLOSE_STRINGS } from '../../i18n/tournament-close-strings';
import {
  Match,
  MatchEvent,
  ProjectorState,
  ProjectorTimer,
  ProjectorView,
  ResolvedMatch,
  TournamentSnapshot,
} from '../../domain/model';
import {
  adjustProjectorTimer,
  createProjectorTimer,
  formatProjectorTimer,
  isProjectorTimerExpired,
} from '../../domain/projector-timer';
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
import { selectProjectorContext } from '../../domain/projector-context';
import {
  buildProjectorViewSelectionData,
  createForcedProjectorView,
  isForcedProjectorViewAvailable,
  isProjectorViewKind,
} from './projector-view-selection';

type TimerPresetId = 'break' | 'lunch' | 'awards';

interface TimerPreset {
  readonly id: TimerPresetId;
  readonly name: string;
  readonly durationMinutes: number;
}

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
  protected readonly projectorState = signal<ProjectorState>({
    forcedView: null,
    message: null,
    timer: null,
  });
  protected readonly projectorWarning = signal<string | null>(null);
  protected readonly projectorStrings = PROJECTOR_PANEL_STRINGS;
  protected readonly projectorViewTitles = PROJECTOR_VIEW_TITLES;
  protected readonly projectorClock = signal(Date.now());
  protected readonly timerPresets = signal<readonly TimerPreset[]>([
    { id: 'break', name: PROJECTOR_PANEL_STRINGS.breakPreset, durationMinutes: 10 },
    { id: 'lunch', name: PROJECTOR_PANEL_STRINGS.lunchPreset, durationMinutes: 45 },
    { id: 'awards', name: PROJECTOR_PANEL_STRINGS.awardsPreset, durationMinutes: 10 },
  ]);
  protected readonly timerBusy = signal(false);
  protected readonly timerSoundEnabled = signal(false);
  private timerAudioContext: AudioContext | null = null;
  private lastAlertedTimerKey: string | null = null;
  protected readonly projectorViewSelection = computed(() =>
    this.createProjectorViewSelectionData(
      this.snapshot(),
      this.projectorState(),
      this.projectorClock(),
    ),
  );
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
  private activeEventMatchId: string | null = null;
  protected readonly tournamentCloseStrings = TOURNAMENT_CLOSE_STRINGS;
  protected readonly canClose = signal(false);
  protected readonly finalResult = signal<FinalTournamentResult | null>(null);
  protected readonly projectorConnected = signal(false);
  private projectorSequence = 0;
  private projectorFingerprint = '';
  private readonly projectorWindowId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `panel-${Date.now()}-${Math.random()}`;
  private readonly projectorHeartbeats = new Map<string, number>();

  async ngOnInit(): Promise<void> {
    const stopListening = this.projectorChannel.listen((message) => {
      if (message.type === 'HEARTBEAT') {
        this.projectorHeartbeats.set(message.senderId, message.sentAt);
        this.projectorConnected.set(true);
      } else if (message.type === 'HELLO' || message.type === 'RESYNC') {
        void this.publishProjectorState(true);
      }
    });
    this.destroyRef.onDestroy(() => {
      stopListening();
      this.projectorChannel.close();
    });
    await this.loadLastRecord();
    this.tournament.set(await tournamentRepository.getTournament());
    await this.loadMatchControl();
    await this.requestPersistentStorage();
    this.checkOfflineStatus();
    await this.publishProjectorState(true);
    const projectorViewClock = window.setInterval(() => this.projectorClock.set(Date.now()), 1000);
    const stateTimer = window.setInterval(() => {
      void this.publishProjectorState(false);
    }, 500);
    const heartbeatTimer = window.setInterval(() => {
      this.projectorChannel.heartbeat(this.projectorWindowId);
      const cutoff = Date.now() - 5000;
      let connected = false;
      for (const [senderId, sentAt] of this.projectorHeartbeats) {
        if (sentAt < cutoff) {
          this.projectorHeartbeats.delete(senderId);
        } else {
          connected = true;
        }
      }
      this.projectorConnected.set(connected);
    }, 2000);
    this.destroyRef.onDestroy(() => {
      window.clearInterval(projectorViewClock);
      window.clearInterval(stateTimer);
      window.clearInterval(heartbeatTimer);
      if (this.timerAudioContext && this.timerAudioContext.state !== 'closed') {
        void this.timerAudioContext.close().catch((error: unknown) => {
          console.error('Closing the projector timer audio context failed', error);
        });
      }
    });
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
    if (playerId !== null) {
      const current = this.matchControl().current;
      const expectedTeamId =
        side === 'home'
          ? current?.resolved.homeTeamId
          : current?.resolved.awayTeamId;
      const player = this.snapshot()?.players.find((candidate) => candidate.id === playerId);
      if (!expectedTeamId || player?.teamId !== expectedTeamId) return;
    }
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

  protected forcedProjectorViewLabel(): string {
    const view = this.projectorState().forcedView;
    if (!view) return '';

    if (view.kind === 'BRACKET' && view.stageId) {
      const bracket = this.projectorViewSelection().brackets.find(
        (candidate) => candidate.id === view.stageId,
      );
      if (bracket) return `${PROJECTOR_VIEW_TITLES[view.kind]} · ${bracket.title}`;
    }

    return PROJECTOR_VIEW_TITLES[view.kind];
  }

  protected selectProjectorView(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;

    if (target.value === '') {
      void this.persistForcedProjectorView(null);
      return;
    }
    if (!isProjectorViewKind(target.value)) return;

    const nowEpochMs = Date.now();
    const data = this.createProjectorViewSelectionData(
      this.snapshot(),
      this.projectorState(),
      nowEpochMs,
    );
    const view = createForcedProjectorView(target.value, data);
    if (view) void this.persistForcedProjectorView(view);
  }

  protected selectProjectorBracket(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const choices = this.createProjectorViewSelectionData(
      this.snapshot(),
      this.projectorState(),
      Date.now(),
    );
    if (!choices.brackets.some((view) => view.id === target.value)) return;
    void this.persistForcedProjectorView({ kind: 'BRACKET', stageId: target.value });
  }

  protected selectedProjectorStageId(): string {
    const view = this.projectorState().forcedView;
    return view?.kind === 'BRACKET' ? (view.stageId ?? '') : '';
  }

  protected returnProjectorToAutomatic(): void {
    void this.persistForcedProjectorView(null);
  }

  protected updateTimerPresetName(id: TimerPresetId, name: string): void {
    this.timerPresets.update((presets) =>
      presets.map((preset) => (preset.id === id ? { ...preset, name } : preset)),
    );
  }

  protected updateTimerPresetDuration(id: TimerPresetId, duration: string): void {
    const durationMinutes = Number(duration);
    this.timerPresets.update((presets) =>
      presets.map((preset) =>
        preset.id === id ? { ...preset, durationMinutes } : preset,
      ),
    );
  }

  protected isTimerPresetValid(preset: TimerPreset): boolean {
    return (
      preset.name.trim().length > 0 &&
      Number.isSafeInteger(preset.durationMinutes) &&
      preset.durationMinutes >= 1
    );
  }

  protected startProjectorTimer(preset: TimerPreset): void {
    if (this.timerBusy()) return;
    if (!this.isTimerPresetValid(preset)) {
      showErrorPopup(PROJECTOR_PANEL_STRINGS.timerInvalid);
      return;
    }

    const created = createProjectorTimer(preset.name, preset.durationMinutes, {
      nowMs: Date.now,
    });
    if (!created.ok) {
      showErrorPopup(PROJECTOR_PANEL_STRINGS.timerInvalid);
      return;
    }
    if (
      this.projectorState().timer &&
      !window.confirm(PROJECTOR_PANEL_STRINGS.timerReplaceConfirm)
    ) {
      return;
    }

    void this.persistProjectorTimer(created.value);
  }

  protected adjustActiveProjectorTimer(minutes: -1 | 1): void {
    const timer = this.projectorState().timer;
    if (!timer || this.timerBusy()) return;
    void this.persistProjectorTimer(
      adjustProjectorTimer(timer, minutes, { nowMs: Date.now }),
    );
  }

  protected cancelProjectorTimer(): void {
    if (this.timerBusy() || !this.projectorState().timer) return;
    void this.persistProjectorTimer(null);
  }

  protected activeTimerRemaining(timer: ProjectorTimer): string {
    return formatProjectorTimer(timer, this.projectorClock());
  }

  protected async setTimerSoundEnabled(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (!input.checked) {
      this.timerSoundEnabled.set(false);
      return;
    }
    if (typeof window.AudioContext !== 'function') {
      showErrorPopup(PROJECTOR_PANEL_STRINGS.timerSoundUnsupported);
      return;
    }

    try {
      this.timerAudioContext ??= new window.AudioContext();
      await this.timerAudioContext.resume();
      this.timerSoundEnabled.set(true);
    } catch (error) {
      console.error('Enabling the projector timer sound failed', error);
      this.timerSoundEnabled.set(false);
      showErrorPopup(PROJECTOR_PANEL_STRINGS.timerSoundFailed);
    }
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

  private createProjectorViewSelectionData(
    snapshot: TournamentSnapshot | null,
    state: ProjectorState,
    nowEpochMs: number,
  ) {
    const context = selectProjectorContext({
      tournamentStatus: snapshot?.tournament.status ?? null,
      matches: snapshot?.matches ?? [],
      timer: state.timer,
      nowEpochMs,
    });
    return buildProjectorViewSelectionData(
      snapshot,
      context.context,
      this.matchControl().next !== null,
      (this.finalResult()?.positions.length ?? 0) > 0,
    );
  }

  private async persistForcedProjectorView(forcedView: ProjectorView | null): Promise<void> {
    try {
      const current = await tournamentRepository.getProjectorState();
      const updated = { ...current, forcedView };
      await tournamentRepository.saveProjectorState(updated);
      this.projectorState.set(updated);
      this.projectorWarning.set(null);
      await this.publishProjectorState(true);
    } catch (error) {
      console.error('Updating the forced projector view failed', error);
      showErrorPopup(PROJECTOR_PANEL_STRINGS.viewSaveFailed);
    }
  }

  private async persistProjectorTimer(timer: ProjectorTimer | null): Promise<void> {
    this.timerBusy.set(true);
    try {
      const current = await tournamentRepository.getProjectorState();
      const updated = { ...current, timer };
      await tournamentRepository.saveProjectorState(updated);
      this.projectorState.set(updated);
      this.lastAlertedTimerKey = null;
      await this.publishProjectorState(true);
    } catch (error) {
      console.error('Updating the projector timer failed', error);
      showErrorPopup(PROJECTOR_PANEL_STRINGS.timerSaveFailed);
    } finally {
      this.timerBusy.set(false);
    }
  }

  private updateTimerSound(timer: ProjectorTimer | null, nowEpochMs: number): void {
    if (!timer || !isProjectorTimerExpired(timer, nowEpochMs)) {
      this.lastAlertedTimerKey = null;
      return;
    }
    if (!this.timerSoundEnabled()) return;

    const timerKey = `${timer.name}:${timer.endsAtEpochMs}`;
    if (this.lastAlertedTimerKey === timerKey) return;
    this.lastAlertedTimerKey = timerKey;
    this.playTimerCompletionSound();
  }

  private playTimerCompletionSound(): void {
    const audioContext = this.timerAudioContext;
    if (!audioContext || audioContext.state === 'closed') return;
    if (audioContext.state === 'suspended') {
      void audioContext
        .resume()
        .then(() => this.playTimerTone())
        .catch((error: unknown) => this.handleTimerSoundFailure(error));
      return;
    }
    this.playTimerTone();
  }

  private playTimerTone(): void {
    const audioContext = this.timerAudioContext;
    if (!audioContext || audioContext.state !== 'running') return;

    try {
      const oscillator = audioContext.createOscillator();
      oscillator.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.75);
    } catch (error) {
      this.handleTimerSoundFailure(error);
    }
  }

  private handleTimerSoundFailure(error: unknown): void {
    console.error('Playing the projector timer sound failed', error);
    this.timerSoundEnabled.set(false);
    showErrorPopup(PROJECTOR_PANEL_STRINGS.timerSoundFailed);
  }

  private async publishProjectorState(force: boolean): Promise<void> {
    const snapshot = await tournamentRepository.getSnapshot();
    let projectorState = await tournamentRepository.getProjectorState();
    const sourceFingerprint = JSON.stringify([snapshot, projectorState]);
    const nowEpochMs = Date.now();
    this.updateTimerSound(projectorState.timer, nowEpochMs);
    if (!force && sourceFingerprint === this.projectorFingerprint) {
      if (projectorState.forcedView?.kind !== 'MATCH_PLATE') return;
      const context = selectProjectorContext({
        tournamentStatus: snapshot?.tournament.status ?? null,
        matches: snapshot?.matches ?? [],
        timer: projectorState.timer,
        nowEpochMs,
      });
      if (context.context === 'MATCH_IN_PROGRESS' || context.context === 'RECENT_RESULT') {
        return;
      }
    }

    this.snapshot.set(snapshot);
    if (projectorState.forcedView) {
      const selectionData = this.createProjectorViewSelectionData(
        snapshot,
        projectorState,
        nowEpochMs,
      );
      if (!isForcedProjectorViewAvailable(projectorState.forcedView, selectionData)) {
        const automaticState = { ...projectorState, forcedView: null };
        try {
          await tournamentRepository.saveProjectorState(automaticState);
        } catch (error) {
          this.projectorState.set(projectorState);
          this.projectorFingerprint = sourceFingerprint;
          console.error('Clearing the unavailable projector view failed', error);
          showErrorPopup(PROJECTOR_PANEL_STRINGS.viewSaveFailed);
          return;
        }

        projectorState = automaticState;
        this.projectorWarning.set(PROJECTOR_PANEL_STRINGS.viewUnavailable);
      }
    }

    this.projectorState.set(projectorState);
    this.projectorFingerprint = JSON.stringify([snapshot, projectorState]);
    this.projectorSequence += 1;
    this.projectorChannel.publishState(
      this.projectorSequence,
      snapshot,
      projectorState,
    );
  }

  protected openProjector(): void {
    const target = new URL('#/proyector', window.location.href);
    const projector = window.open(target.href, '_blank', 'popup=yes');
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
    const control = buildMatchControlView(snapshot, resolved, schedule.orderedMatchIds);
    const currentMatchId = control.current?.match.id ?? null;
    if (currentMatchId !== this.activeEventMatchId) {
      this.activeEventMatchId = currentMatchId;
      this.homePlayerId.set(null);
      this.awayPlayerId.set(null);
      this.homePlayerSearch.set('');
      this.awayPlayerSearch.set('');
      this.activePlayerSearch.set(null);
      this.directMode.set(false);
      this.directHomeScore.set(0);
      this.directAwayScore.set(0);
      this.walkoverMatchId.set(null);
    }
    this.matchControl.set(control);
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
