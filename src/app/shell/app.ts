import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, fromEvent } from 'rxjs';
import { tournamentRepository } from '../../data/tournament-repository';
import { TournamentSnapshot } from '../../domain/model';
import {
  autoSaveWriteFailed,
  autoSaveWriteSucceeded,
  backupCreated,
  backupQuotaExceeded,
  isQuotaExceededError,
} from '../../data/backup-events';
import {
  getAutoSaveDirectoryHandle,
  saveSnapshotToAutoSaveDirectory,
} from '../../data/auto-save-directory';
import { databaseWriteFailed, setDatabaseWriteAllowed } from '../../data/database-write-gate';
import { BACKUP_STRINGS } from '../../i18n/backup-strings';
import { PERSISTENCE_STRINGS } from '../../i18n/persistence-strings';
import { TOURNAMENT_FILE_STRINGS } from '../../i18n/tournament-file-strings';
import { PANEL_LOCK_STRINGS } from '../../i18n/panel-lock-strings';
import { PanelLockService } from './panel-lock.service';
import { ServiceWorkerUpdateService } from './service-worker-update.service';
import { showErrorModal, showErrorPopup } from '../error-popup';
import { TournamentFileBarComponent } from '../tournament-file-bar/tournament-file-bar.component';
import { PrimaryNavigationComponent } from '../navigation/primary-navigation.component';
import { ErrorModalComponent } from '../error-modal/error-modal.component';
import { SERVICE_WORKER_STRINGS } from '../../i18n/service-worker-strings';
import { ERROR_MODAL_STRINGS } from '../../i18n/error-modal-strings';
import packageMetadata from '../../../package.json';

@Component({
  imports: [
    ErrorModalComponent,
    PrimaryNavigationComponent,
    RouterOutlet,
    TournamentFileBarComponent,
  ],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  protected readonly strings = PERSISTENCE_STRINGS;
  protected readonly appVersion = packageMetadata.version;
  protected readonly serviceWorkerStrings = SERVICE_WORKER_STRINGS;
  protected readonly updateService = inject(ServiceWorkerUpdateService);
  protected readonly online = signal(typeof navigator === 'undefined' || navigator.onLine);
  protected readonly projectorRoute = signal(false);
  protected readonly showNavigation = signal(false);
  protected readonly ready = signal(false);
  protected readonly databaseAvailable = signal(true);
  protected readonly backupQuotaWarning = signal(false);
  protected readonly backupQuotaWarningMessage = BACKUP_STRINGS.quotaWarning;
  protected readonly autoSaveFailure = signal(false);
  protected readonly databaseWriteFailure = signal(false);
  protected readonly fileStrings = TOURNAMENT_FILE_STRINGS;
  protected readonly lockStrings = PANEL_LOCK_STRINGS;
  protected readonly panelLock = new PanelLockService();
  private readonly shellErrorModal = effect(() => {
    if (!this.ready()) return;

    const recoveryMessage = this.recoveryMessage();
    if (recoveryMessage) {
      showErrorModal({
        title: ERROR_MODAL_STRINGS.recoveryTitle,
        message: recoveryMessage,
        primaryActionLabel: this.lockStrings.reviewBackups,
        secondaryActionLabel: this.lockStrings.dismiss,
        onPrimaryAction: () => this.reviewRecoveryBackups(),
        onSecondaryAction: () => this.panelLock.dismissRecovery(),
        onDismiss: () => this.panelLock.dismissRecovery(),
      });
      return;
    }

    if (this.panelLock.readOnly()) {
      const canTakeControl =
        this.panelLock.status() === 'READ_ONLY' || this.panelLock.status() === 'TAKING_CONTROL';
      showErrorModal({
        title: ERROR_MODAL_STRINGS.persistenceTitle,
        message: this.panelLock.takeoverFailed()
          ? `${this.lockMessage()} ${this.lockStrings.takeControlFailed}`
          : this.lockMessage(),
        ...(canTakeControl
          ? {
              primaryActionLabel: this.lockStrings.takeControl,
              onPrimaryAction: () => this.takePanelControl(),
            }
          : {}),
      });
      return;
    }

    if (this.backupQuotaWarning()) {
      showErrorModal({
        title: ERROR_MODAL_STRINGS.backupTitle,
        message: this.backupQuotaWarningMessage,
        onDismiss: () => this.backupQuotaWarning.set(false),
      });
      return;
    }

    if (this.autoSaveFailure()) {
      showErrorModal({
        title: ERROR_MODAL_STRINGS.autoSaveTitle,
        message: this.fileStrings.autoSaveFailed,
        onDismiss: () => this.autoSaveFailure.set(false),
      });
      return;
    }

    if (this.databaseWriteFailure()) {
      showErrorModal({
        title: ERROR_MODAL_STRINGS.persistenceTitle,
        message: this.lockStrings.writeFailed,
        primaryActionLabel: this.lockStrings.saveToFile,
        onPrimaryAction: () => this.fileBar?.saveTournamentFile(),
        onDismiss: () => this.databaseWriteFailure.set(false),
      });
    }
  });
  protected readonly lockMessage = computed(() => {
    switch (this.panelLock.status()) {
      case 'READ_ONLY':
        return PANEL_LOCK_STRINGS.readOnly;
      case 'TAKING_CONTROL':
        return PANEL_LOCK_STRINGS.takingControl;
      case 'UNSUPPORTED':
        return PANEL_LOCK_STRINGS.unsupported;
      case 'FAILED':
        return PANEL_LOCK_STRINGS.failed;
      default:
        return '';
    }
  });
  protected readonly recoveryMessage = computed(() => {
    const recovery = this.panelLock.recovery();
    if (!recovery) return null;
    const savedAt = recovery.lastSavedAt
      ? new Date(recovery.lastSavedAt).toLocaleTimeString('es-AR')
      : PANEL_LOCK_STRINGS.unknownSaveTime;
    return PANEL_LOCK_STRINGS.unexpectedShutdown(savedAt);
  });
  protected readonly showUpdateNotice = computed(
    () =>
      !this.projectorRoute() &&
      !this.panelLock.readOnly() &&
      !this.recoveryMessage() &&
      !this.backupQuotaWarning() &&
      !this.autoSaveFailure() &&
      !this.databaseWriteFailure() &&
      (this.updateService.updateAvailable() || this.updateService.updateFailed()),
  );
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  @ViewChild('fileBar') private fileBar?: TournamentFileBarComponent;

  async ngOnInit(): Promise<void> {
    this.destroyRef.onDestroy(() => this.panelLock.dispose());
    setDatabaseWriteAllowed(false);
    this.online.set(typeof navigator === 'undefined' || navigator.onLine);
    this.updateNavigation(this.router.url);
    this.updateService.checkForUpdates();
    fromEvent(window, 'online')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.online.set(true));
    fromEvent(window, 'offline')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.online.set(false));
    this.databaseAvailable.set(await tournamentRepository.isAvailable());
    if (!this.databaseAvailable()) {
      showErrorPopup(PERSISTENCE_STRINGS.databaseUnavailable);
      this.ready.set(true);
      return;
    }

    if (!this.router.url.startsWith('/proyector')) await this.panelLock.activate();
    backupQuotaExceeded.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.backupQuotaWarning.set(true);
    });
    databaseWriteFailed.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.databaseWriteFailure.set(true);
    });
    autoSaveWriteFailed.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.autoSaveFailure.set(true);
    });
    autoSaveWriteSucceeded.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.autoSaveFailure.set(false);
    });
    backupCreated.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((backup) => {
      if (this.router.url.startsWith('/proyector')) return;
      window.setTimeout(() => void this.saveBackupToFolder(backup.snapshot), 0);
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
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        this.updateNavigation(event.urlAfterRedirects);
        if (event.urlAfterRedirects === '/panel' || event.urlAfterRedirects === '/proyector') {
          localStorage.setItem('fast-seven-last-screen', event.urlAfterRedirects);
        }
        if (event.urlAfterRedirects.startsWith('/proyector')) {
          void this.panelLock.deactivate();
        } else {
          void this.panelLock.activate();
        }
      });
    const backupTimer = window.setInterval(() => {
      if (this.panelLock.status() !== 'OWNER') return;
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

  private async saveBackupToFolder(snapshot: TournamentSnapshot): Promise<void> {
    try {
      const handle = await getAutoSaveDirectoryHandle();
      if (!handle) return;
      const result = await saveSnapshotToAutoSaveDirectory(
        snapshot,
        packageMetadata.version,
        handle,
      );
      if (result === 'SAVED') this.autoSaveFailure.set(false);
    } catch (error) {
      console.error('Saving the tournament to the selected folder failed', error);
    }
  }

  protected clearDatabaseWriteFailure(): void {
    this.databaseWriteFailure.set(false);
  }

  protected takePanelControl(): void {
    void this.panelLock.takeControl();
  }

  protected reviewRecoveryBackups(): void {
    this.panelLock.dismissRecovery();
    void this.router.navigateByUrl('/panel/respaldo');
  }

  private updateNavigation(url: string): void {
    const route = url.split('?')[0];
    const isProjector = route.startsWith('/proyector');
    this.projectorRoute.set(isProjector);
    this.showNavigation.set(!isProjector && route !== '/' && route !== '/bienvenida');
  }
}
