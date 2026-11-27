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
import { ResolvedMatch, TournamentSnapshot } from '../../domain/model';
import { resolveMatches } from '../../domain/resolve-matches';
import { createSeededRng } from '../../domain/rng';
import { computeScheduleDetails, ScheduleDetails } from '../../domain/schedule';
import { buildMatchControlView, MatchControlView } from '../../domain/match-control';

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

  protected async finishControlMatch(matchId: string): Promise<void> {
    if (this.startBusy()) return;
    if (!window.confirm(MATCH_CONTROL_STRINGS.confirmFinish)) return;
    this.startBusy.set(true);
    try {
      await tournamentRepository.finishMatch(matchId, new Date().toISOString());
      await this.loadMatchControl();
      this.statusMessage.set(MATCH_CONTROL_STRINGS.matchFinished);
    } catch (error) {
      console.error('Finishing match failed', error);
      showErrorPopup(MATCH_CONTROL_STRINGS.finishFailed);
    } finally {
      this.startBusy.set(false);
    }
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

  private async loadMatchControl(): Promise<void> {
    const snapshot = await tournamentRepository.getSnapshot();
    this.snapshot.set(snapshot);
    this.tournament.set(snapshot?.tournament ?? null);
    if (!snapshot) {
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
