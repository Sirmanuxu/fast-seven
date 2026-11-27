import {
  Component,
  computed,
  DestroyRef,
  EventEmitter,
  inject,
  OnInit,
  Output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { tournamentRepository } from '../../data/tournament-repository';
import { TournamentSnapshot } from '../../domain/model';
import type { TournamentFileValidationError } from '../../data/tournament-file-validation';
import {
  chooseAutoSaveDirectory,
  getAutoSaveDirectoryHandle,
  getAutoSaveDirectoryPermission,
  removeAutoSaveDirectory,
  requestAutoSaveDirectoryPermission,
  saveSnapshotToAutoSaveDirectory,
  supportsAutoSaveDirectory,
} from '../../data/auto-save-directory';
import { AutoSaveDirectoryHandle } from '../../data/tournament-database';
import {
  checksumTournamentData,
  createTournamentFile,
  createTournamentFileName,
} from '../../data/tournament-file';
import { TOURNAMENT_FILE_STRINGS } from '../../i18n/tournament-file-strings';
import { showErrorPopup } from '../error-popup';
import packageMetadata from '../../../package.json';

@Component({
  selector: 'app-tournament-file-bar',
  templateUrl: './tournament-file-bar.component.html',
  styleUrl: './tournament-file-bar.component.css',
})
export class TournamentFileBarComponent implements OnInit {
  @Output() readonly fileSaved = new EventEmitter<void>();
  protected readonly strings = TOURNAMENT_FILE_STRINGS;
  protected readonly available = signal(false);
  protected readonly projectorRoute = signal(false);
  protected readonly saving = signal(false);
  protected readonly autoSaveBusy = signal(false);
  protected readonly autoSaveSupported = signal(false);
  protected readonly autoSaveStatus = signal<
    'UNSUPPORTED' | 'UNCONFIGURED' | 'READY' | 'PERMISSION_REQUIRED'
  >('UNSUPPORTED');
  protected readonly unsavedChanges = signal(false);
  protected readonly statusMessage = signal<string | null>(null);
  protected readonly warningIntervalMin = signal(30);
  private readonly nowMs = signal(Date.now());
  private readonly lastSavedAtMs = signal<number | null>(null);
  private readonly unsavedSinceMs = signal<number | null>(null);
  protected readonly lastSavedLabel = computed(() => {
    const savedAt = this.lastSavedAtMs();
    return savedAt === null
      ? TOURNAMENT_FILE_STRINGS.neverSaved
      : TOURNAMENT_FILE_STRINGS.lastSaved(
          Math.max(0, Math.floor((this.nowMs() - savedAt) / 60_000)),
        );
  });
  protected readonly unsavedWarningVisible = computed(() => {
    const unsavedSince = this.unsavedSinceMs();
    return (
      this.available() &&
      !this.projectorRoute() &&
      this.unsavedChanges() &&
      unsavedSince !== null &&
      this.nowMs() - unsavedSince > this.warningIntervalMin() * 60_000
    );
  });

  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private lastObservedSnapshot: string | null = null;
  private savedChecksum: string | null = null;
  private refreshing = false;
  private loadErrorShown = false;
  private directoryErrorShown = false;
  private autoSaveDirectory: AutoSaveDirectoryHandle | null = null;

  ngOnInit(): void {
    this.projectorRoute.set(this.router.url.startsWith('/proyector'));
    this.autoSaveSupported.set(supportsAutoSaveDirectory());
    void this.refreshAutoSaveDirectoryStatus();
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        this.projectorRoute.set(event.urlAfterRedirects.startsWith('/proyector'));
      });

    void this.refreshStatus();
    const statusTimer = window.setInterval(() => {
      this.nowMs.set(Date.now());
      void this.refreshStatus();
      void this.refreshAutoSaveDirectoryStatus();
    }, 30_000);
    this.destroyRef.onDestroy(() => window.clearInterval(statusTimer));
  }

  async saveTournamentFile(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.statusMessage.set(null);
    try {
      const snapshot = await tournamentRepository.getSnapshot();
      if (!snapshot) throw new Error('No tournament is available');

      const exportedAt = new Date();
      const exportedAtIso = exportedAt.toISOString();
      const file = await createTournamentFile(snapshot, packageMetadata.version, exportedAtIso);
      const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = createTournamentFileName(snapshot.tournament.name, exportedAt);
      link.style.display = 'none';
      document.body.appendChild(link);
      try {
        link.click();
      } finally {
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }

      await tournamentRepository.recordTournamentFileExport(
        snapshot.tournament.id,
        exportedAtIso,
        file.checksum,
      );
      this.savedChecksum = file.checksum;
      this.lastSavedAtMs.set(exportedAt.getTime());

      const currentSnapshot = await tournamentRepository.getSnapshot();
      if (!currentSnapshot) throw new Error('No tournament is available');
      this.lastObservedSnapshot = JSON.stringify(currentSnapshot);
      const currentChecksum = await checksumTournamentData(currentSnapshot);
      this.setUnsavedState(currentChecksum !== file.checksum, currentSnapshot.tournament.updatedAt);
      this.statusMessage.set(TOURNAMENT_FILE_STRINGS.savedConfirmation);
      this.fileSaved.emit();
    } catch (error) {
      console.error('Saving tournament file failed', error);
      showErrorPopup(TOURNAMENT_FILE_STRINGS.saveFailed);
    } finally {
      this.saving.set(false);
    }
  }

  protected async onTournamentFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const selectedFile = input.files?.[0];
    if (!selectedFile) return;

    this.saving.set(true);
    this.statusMessage.set(null);
    try {
      const { validateTournamentFileText } = await import('../../data/tournament-file-validation');
      const validation = await validateTournamentFileText(await selectedFile.text());
      if (!validation.ok) {
        showErrorPopup(this.validationMessage(validation.error));
        return;
      }

      const { file, migrated } = validation.value;
      const finishedMatches = file.data.matches.filter(
        (match) => match.status === 'FINISHED',
      ).length;
      const accepted = window.confirm(
        TOURNAMENT_FILE_STRINGS.confirmLoad(
          file.data.tournament.name,
          new Date(file.data.tournament.date).toLocaleDateString('es-AR'),
          file.data.teams.length,
          finishedMatches,
          migrated,
          validation.value.warnings.map(
            (warning) => TOURNAMENT_FILE_STRINGS.invariantWarnings[warning],
          ),
        ),
      );
      if (!accepted) return;

      await tournamentRepository.loadTournamentFile(file);
      this.lastObservedSnapshot = null;
      await this.refreshStatus();
      this.statusMessage.set(TOURNAMENT_FILE_STRINGS.loaded);
      await this.router.navigateByUrl('/panel');
    } catch (error) {
      console.error('Loading tournament file failed', error);
      showErrorPopup(TOURNAMENT_FILE_STRINGS.loadFailed);
    } finally {
      input.value = '';
      this.saving.set(false);
    }
  }

  protected async chooseAutoSaveFolder(): Promise<void> {
    if (this.autoSaveBusy() || !this.autoSaveSupported()) return;
    this.autoSaveBusy.set(true);
    try {
      const handle = await chooseAutoSaveDirectory();
      this.autoSaveDirectory = handle;
      await this.saveCurrentSnapshotToFolder(handle);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.error('Selecting the tournament auto-save folder failed', error);
        showErrorPopup(TOURNAMENT_FILE_STRINGS.autoSaveDirectoryFailed);
      }
    } finally {
      this.autoSaveBusy.set(false);
    }
  }

  protected async grantAutoSaveFolderAccess(): Promise<void> {
    if (this.autoSaveBusy()) return;
    this.autoSaveBusy.set(true);
    try {
      const handle = this.autoSaveDirectory ?? (await getAutoSaveDirectoryHandle());
      if (!handle) {
        this.autoSaveStatus.set('UNCONFIGURED');
        return;
      }
      this.autoSaveDirectory = handle;
      const permission = await requestAutoSaveDirectoryPermission(handle);
      if (permission !== 'granted') {
        this.autoSaveStatus.set('PERMISSION_REQUIRED');
        return;
      }
      await this.saveCurrentSnapshotToFolder(handle);
    } catch (error) {
      console.error('Requesting tournament auto-save folder access failed', error);
      showErrorPopup(TOURNAMENT_FILE_STRINGS.autoSaveDirectoryFailed);
    } finally {
      this.autoSaveBusy.set(false);
    }
  }

  protected async stopAutoSaveToFolder(): Promise<void> {
    if (this.autoSaveBusy()) return;
    this.autoSaveBusy.set(true);
    try {
      await removeAutoSaveDirectory();
      this.autoSaveDirectory = null;
      this.autoSaveStatus.set('UNCONFIGURED');
      this.statusMessage.set(TOURNAMENT_FILE_STRINGS.autoSaveDirectoryRemoved);
    } catch (error) {
      console.error('Removing the tournament auto-save folder failed', error);
      showErrorPopup(TOURNAMENT_FILE_STRINGS.autoSaveDirectoryFailed);
    } finally {
      this.autoSaveBusy.set(false);
    }
  }

  private async refreshAutoSaveDirectoryStatus(): Promise<void> {
    if (!this.autoSaveSupported()) {
      this.autoSaveStatus.set('UNSUPPORTED');
      return;
    }
    try {
      const handle = await getAutoSaveDirectoryHandle();
      this.autoSaveDirectory = handle;
      if (!handle) {
        this.autoSaveStatus.set('UNCONFIGURED');
        this.directoryErrorShown = false;
        return;
      }
      this.autoSaveStatus.set(
        (await getAutoSaveDirectoryPermission(handle)) === 'granted'
          ? 'READY'
          : 'PERMISSION_REQUIRED',
      );
      this.directoryErrorShown = false;
    } catch (error) {
      console.error('Loading tournament auto-save folder status failed', error);
      if (!this.directoryErrorShown) {
        showErrorPopup(TOURNAMENT_FILE_STRINGS.autoSaveStatusLoadFailed);
        this.directoryErrorShown = true;
      }
    }
  }

  private async saveCurrentSnapshotToFolder(handle: AutoSaveDirectoryHandle): Promise<void> {
    const snapshot = await tournamentRepository.getSnapshot();
    if (!snapshot) throw new Error('No tournament is available');
    const result = await saveSnapshotToAutoSaveDirectory(snapshot, packageMetadata.version, handle);
    if (result === 'PERMISSION_REQUIRED') {
      this.autoSaveStatus.set('PERMISSION_REQUIRED');
      return;
    }
    if (result === 'UNCONFIGURED') {
      this.autoSaveStatus.set('UNCONFIGURED');
      return;
    }
    this.autoSaveStatus.set('READY');
    this.statusMessage.set(TOURNAMENT_FILE_STRINGS.autoSaveDirectorySaved);
  }

  private async refreshStatus(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      const [snapshot, fileState] = await Promise.all([
        tournamentRepository.getSnapshot(),
        tournamentRepository.getTournamentFileState(),
      ]);
      if (!snapshot) {
        this.available.set(false);
        this.lastObservedSnapshot = null;
        this.savedChecksum = null;
        this.lastSavedAtMs.set(null);
        this.unsavedChanges.set(false);
        this.unsavedSinceMs.set(null);
        return;
      }

      this.available.set(true);
      this.warningIntervalMin.set(fileState.warningIntervalMin);
      const stateMatchesTournament = fileState.tournamentId === snapshot.tournament.id;
      this.savedChecksum = stateMatchesTournament ? fileState.checksum : null;
      const savedAt =
        stateMatchesTournament && fileState.exportedAt ? Date.parse(fileState.exportedAt) : null;
      this.lastSavedAtMs.set(savedAt !== null && Number.isFinite(savedAt) ? savedAt : null);

      const serializedSnapshot = JSON.stringify(snapshot);
      if (serializedSnapshot === this.lastObservedSnapshot) return;
      this.lastObservedSnapshot = serializedSnapshot;
      const currentChecksum = await checksumTournamentData(snapshot);
      const isUnsaved = this.savedChecksum
        ? currentChecksum !== this.savedChecksum
        : this.hasTournamentChanges(snapshot);
      this.setUnsavedState(isUnsaved, snapshot.tournament.updatedAt);
      this.loadErrorShown = false;
    } catch (error) {
      console.error('Loading tournament file status failed', error);
      if (!this.loadErrorShown) {
        showErrorPopup(TOURNAMENT_FILE_STRINGS.statusLoadFailed);
        this.loadErrorShown = true;
      }
    } finally {
      this.refreshing = false;
    }
  }

  private hasTournamentChanges(snapshot: TournamentSnapshot): boolean {
    return (
      snapshot.tournament.updatedAt !== snapshot.tournament.createdAt ||
      snapshot.players.length > 0 ||
      snapshot.teams.length > 0 ||
      snapshot.stages.length > 0 ||
      snapshot.groups.length > 0 ||
      snapshot.matches.length > 0 ||
      snapshot.events.length > 0 ||
      snapshot.draws.length > 0
    );
  }

  private setUnsavedState(isUnsaved: boolean, lastChangedAt: string): void {
    this.unsavedChanges.set(isUnsaved);
    if (!isUnsaved) {
      this.unsavedSinceMs.set(null);
      return;
    }
    const changedAt = Date.parse(lastChangedAt);
    this.unsavedSinceMs.set(Number.isFinite(changedAt) ? changedAt : Date.now());
  }

  private validationMessage(error: TournamentFileValidationError): string {
    switch (error) {
      case 'INVALID_JSON':
        return TOURNAMENT_FILE_STRINGS.invalidJson;
      case 'INVALID_FORMAT':
        return TOURNAMENT_FILE_STRINGS.invalidFormat;
      case 'NEWER_SCHEMA':
        return TOURNAMENT_FILE_STRINGS.newerSchema;
      case 'UNSUPPORTED_SCHEMA':
        return TOURNAMENT_FILE_STRINGS.unsupportedSchema;
      case 'CHECKSUM_MISMATCH':
        return TOURNAMENT_FILE_STRINGS.checksumMismatch;
      case 'INVALID_STRUCTURE':
        return TOURNAMENT_FILE_STRINGS.invalidStructure;
      case 'MISSING_IDS':
        return TOURNAMENT_FILE_STRINGS.missingIds;
      case 'INVALID_REFERENCES':
        return TOURNAMENT_FILE_STRINGS.invalidReferences;
    }
  }
}
