import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';
import { spikeDatabase, SpikeRecord } from '../data/spike-database';
import { SPIKE_STRINGS } from '../i18n/spike-strings';
import { ProjectorChannel } from '../sync/projector-channel';

@Component({
  selector: 'app-panel',
  templateUrl: './panel.component.html',
  styleUrl: './panel.component.css',
})
export class PanelComponent implements OnInit {
  private readonly swUpdate = inject(SwUpdate);
  private readonly projectorChannel = new ProjectorChannel();
  private readonly destroyRef = inject(DestroyRef);

  protected readonly strings = SPIKE_STRINGS;
  protected readonly lastRecord = signal<SpikeRecord | null>(null);
  protected readonly persistenceStatus = signal<string>(SPIKE_STRINGS.persistenceUnsupported);
  protected readonly offlineStatus = signal<string>(SPIKE_STRINGS.offlinePending);
  protected readonly popupBlocked = signal(false);

  async ngOnInit(): Promise<void> {
    this.destroyRef.onDestroy(() => this.projectorChannel.close());
    await this.loadLastRecord();
    await this.requestPersistentStorage();
    this.checkOfflineStatus();
  }

  protected async saveTest(): Promise<void> {
    const record: SpikeRecord = {
      message: `Prueba guardada a las ${new Date().toLocaleTimeString('es-AR')}`,
      createdAt: new Date().toISOString(),
    };
    await spikeDatabase.spikeRecords.add(record);
    await this.loadLastRecord();
    this.projectorChannel.publish(record.message);
  }

  protected openProjector(): void {
    const target = new URL('#/proyector', window.location.href);
    const projector = window.open(target.href, 'fast-seven-projector', 'popup=yes');
    this.popupBlocked.set(projector === null);
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
      return;
    }

    void this.swUpdate.checkForUpdate();
    this.swUpdate.versionUpdates.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event.type === 'NO_NEW_VERSION_DETECTED' || event.type === 'VERSION_READY') {
        this.offlineStatus.set(SPIKE_STRINGS.offlineReady);
      }
    });
  }
}
