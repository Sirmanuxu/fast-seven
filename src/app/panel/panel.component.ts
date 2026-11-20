import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { Router } from '@angular/router';
import { spikeDatabase, SpikeRecord } from '../../data/spike-database';
import { tournamentRepository } from '../../data/tournament-repository';
import { PERSISTENCE_STRINGS } from '../../i18n/persistence-strings';
import { SPIKE_STRINGS } from '../../i18n/spike-strings';
import { ProjectorChannel } from '../../sync/projector-channel';
import { showErrorPopup } from '../error-popup';

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

  async ngOnInit(): Promise<void> {
    this.destroyRef.onDestroy(() => this.projectorChannel.close());
    await this.loadLastRecord();
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
