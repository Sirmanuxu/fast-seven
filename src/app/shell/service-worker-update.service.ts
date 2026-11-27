import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';
import { SERVICE_WORKER_STRINGS } from '../../i18n/service-worker-strings';

@Injectable({ providedIn: 'root' })
export class ServiceWorkerUpdateService {
  private readonly swUpdate = inject(SwUpdate, { optional: true });
  private readonly destroyRef = inject(DestroyRef);

  readonly updateAvailable = signal(false);
  readonly updateFailed = signal(false);

  checkForUpdates(): void {
    const swUpdate = this.swUpdate;
    if (!swUpdate?.isEnabled) return;

    swUpdate.versionUpdates.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (event) => {
        if (event.type === 'VERSION_READY') {
          this.updateAvailable.set(true);
          this.updateFailed.set(false);
        } else if (event.type === 'VERSION_INSTALLATION_FAILED') {
          this.reportFailure(event.error);
        }
      },
      error: (error: unknown) => this.reportFailure(error),
    });

    void swUpdate.checkForUpdate().catch((error: unknown) => this.reportFailure(error));
  }

  async updateNow(): Promise<void> {
    const swUpdate = this.swUpdate;
    if (!swUpdate?.isEnabled || !this.updateAvailable()) return;
    if (!window.confirm(SERVICE_WORKER_STRINGS.confirmUpdate)) return;

    try {
      const activated = await swUpdate.activateUpdate();
      if (!activated) {
        this.updateFailed.set(true);
        return;
      }
      window.location.reload();
    } catch (error) {
      this.reportFailure(error);
    }
  }

  private reportFailure(error: unknown): void {
    console.error('Service worker update failed', error);
    this.updateFailed.set(true);
  }
}
