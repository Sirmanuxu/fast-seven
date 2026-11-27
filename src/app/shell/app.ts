import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { tournamentRepository } from '../../data/tournament-repository';
import { backupQuotaExceeded, isQuotaExceededError } from '../../data/backup-events';
import { BACKUP_STRINGS } from '../../i18n/backup-strings';
import { PERSISTENCE_STRINGS } from '../../i18n/persistence-strings';
import { showErrorPopup } from '../error-popup';
import { TournamentFileBarComponent } from '../tournament-file-bar/tournament-file-bar.component';
import packageMetadata from '../../../package.json';

@Component({
  imports: [RouterOutlet, TournamentFileBarComponent],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  protected readonly strings = PERSISTENCE_STRINGS;
  protected readonly appVersion = packageMetadata.version;
  protected readonly ready = signal(false);
  protected readonly databaseAvailable = signal(true);
  protected readonly backupQuotaWarning = signal(false);
  protected readonly backupQuotaWarningMessage = BACKUP_STRINGS.quotaWarning;
  private readonly router = inject(Router);
  private readonly swUpdate = inject(SwUpdate, { optional: true });
  private readonly destroyRef = inject(DestroyRef);

  async ngOnInit(): Promise<void> {
    const swUpdate = this.swUpdate;
    if (swUpdate?.isEnabled) {
      void swUpdate.checkForUpdate();
      swUpdate.versionUpdates.subscribe((event) => {
        if (event.type === 'VERSION_READY') {
          void swUpdate.activateUpdate().then(() => window.location.reload());
        }
      });
    }
    this.databaseAvailable.set(await tournamentRepository.isAvailable());
    if (!this.databaseAvailable()) {
      showErrorPopup(PERSISTENCE_STRINGS.databaseUnavailable);
      this.ready.set(true);
      return;
    }

    backupQuotaExceeded.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.backupQuotaWarning.set(true);
    });

    const tournament = await tournamentRepository.getTournament();
    if (!tournament) {
      if (this.router.url === '/panel' || this.router.url === '/') {
        await this.router.navigateByUrl('/bienvenida');
      }
    } else if (this.router.url === '/' || this.router.url === '/bienvenida') {
      await this.router.navigateByUrl(localStorage.getItem('fast-seven-last-screen') ?? '/panel');
    }

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        if (event.urlAfterRedirects === '/panel' || event.urlAfterRedirects === '/proyector') {
          localStorage.setItem('fast-seven-last-screen', event.urlAfterRedirects);
        }
      });
    const backupTimer = window.setInterval(() => {
      if (this.router.url.startsWith('/proyector')) return;
      void tournamentRepository.createPeriodicBackupIfDue(Date.now()).catch((error: unknown) => {
        console.error('Creating periodic tournament backup failed', error);
        if (!isQuotaExceededError(error)) {
          showErrorPopup(BACKUP_STRINGS.periodicBackupFailed);
        }
      });
    }, 60_000);
    this.destroyRef.onDestroy(() => window.clearInterval(backupTimer));
    this.ready.set(true);
  }
}
