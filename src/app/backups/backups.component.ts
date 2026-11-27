import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Backup } from '../../domain/model';
import { BACKUP_REASON_LABELS, BACKUP_STRINGS } from '../../i18n/backup-strings';
import { tournamentRepository } from '../../data/tournament-repository';
import { showErrorPopup } from '../error-popup';

interface BackupListItem {
  readonly backup: Backup;
  readonly dateLabel: string;
  readonly reasonLabel: string;
  readonly finishedMatchCount: number;
}

@Component({
  selector: 'app-backups',
  templateUrl: './backups.component.html',
  styleUrl: './backups.component.css',
})
export class BackupsComponent implements OnInit {
  protected readonly strings = BACKUP_STRINGS;
  protected readonly backups = signal<readonly Backup[]>([]);
  protected readonly busy = signal(false);
  protected readonly statusMessage = signal<string | null>(null);
  protected readonly listItems = computed<readonly BackupListItem[]>(() =>
    this.backups().map((backup) => ({
      backup,
      dateLabel: new Date(backup.createdAt).toLocaleString('es-AR'),
      reasonLabel: BACKUP_REASON_LABELS[backup.reason],
      finishedMatchCount: backup.snapshot.matches.filter(
        (match) => match.status === 'FINISHED' && !match.isPhantom,
      ).length,
    })),
  );
  private readonly router = inject(Router);

  async ngOnInit(): Promise<void> {
    try {
      this.backups.set(await tournamentRepository.getBackups());
    } catch (error) {
      console.error('Loading tournament backups failed', error);
      showErrorPopup(BACKUP_STRINGS.loadFailed);
    }
  }

  protected backToPanel(): void {
    void this.router.navigateByUrl('/panel');
  }

  protected async restoreBackup(backup: Backup): Promise<void> {
    if (this.busy() || !window.confirm(BACKUP_STRINGS.confirmRestore)) return;

    this.busy.set(true);
    try {
      await tournamentRepository.restoreBackup(backup.id, new Date().toISOString());
      this.backups.set(await tournamentRepository.getBackups());
      this.statusMessage.set(BACKUP_STRINGS.restored);
    } catch (error) {
      console.error('Restoring tournament backup failed', error);
      showErrorPopup(BACKUP_STRINGS.restoreFailed);
    } finally {
      this.busy.set(false);
    }
  }
}
