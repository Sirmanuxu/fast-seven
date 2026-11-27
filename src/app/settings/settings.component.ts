import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tournamentRepository } from '../../data/tournament-repository';
import { Tournament } from '../../domain/model';
import { SETTINGS_STRINGS } from '../../i18n/settings-strings';
import { showErrorPopup } from '../error-popup';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
})
export class SettingsComponent implements OnInit {
  protected readonly strings = SETTINGS_STRINGS;
  protected readonly tournament = signal<Tournament | null>(null);
  protected readonly busy = signal(false);
  protected readonly statusMessage = signal<string | null>(null);
  protected readonly backupIntervalDraft = signal('5');
  private readonly router = inject(Router);

  async ngOnInit(): Promise<void> {
    try {
      const tournament = await tournamentRepository.getTournament();
      if (!tournament) {
        await this.router.navigateByUrl('/bienvenida');
        return;
      }
      this.tournament.set(tournament);
      this.backupIntervalDraft.set(String(tournament.backupIntervalMin));
    } catch (error) {
      console.error('Loading tournament settings failed', error);
      showErrorPopup(SETTINGS_STRINGS.tournamentLoadFailed);
    }
  }

  protected async createNewTournament(): Promise<void> {
    if (this.busy()) return;
    const confirmation = window.prompt(SETTINGS_STRINGS.confirmNewTournament);
    if (confirmation !== 'BORRAR') return;

    this.busy.set(true);
    try {
      await tournamentRepository.deleteTournamentWithBackup();
      await this.router.navigateByUrl('/bienvenida');
    } catch (error) {
      console.error('Deleting tournament failed', error);
      showErrorPopup(SETTINGS_STRINGS.newTournamentFailed);
    } finally {
      this.busy.set(false);
    }
  }

  protected async restartFixture(): Promise<void> {
    if (this.busy() || this.tournament()?.status !== 'RUNNING') return;
    if (!window.confirm(SETTINGS_STRINGS.confirmResetFixture)) return;
    if (!window.confirm(SETTINGS_STRINGS.confirmResetFixtureAgain)) return;

    this.busy.set(true);
    try {
      await tournamentRepository.resetFixture(new Date().toISOString());
      this.tournament.set(await tournamentRepository.getTournament());
      this.statusMessage.set(SETTINGS_STRINGS.resetFixtureDone);
    } catch (error) {
      console.error('Resetting fixture failed', error);
      showErrorPopup(SETTINGS_STRINGS.resetFixtureFailed);
    } finally {
      this.busy.set(false);
    }
  }

  protected updateBackupIntervalDraft(event: Event): void {
    this.backupIntervalDraft.set((event.target as HTMLInputElement).value);
  }

  protected async saveBackupInterval(): Promise<void> {
    const intervalMin = Number(this.backupIntervalDraft());
    if (!Number.isInteger(intervalMin) || intervalMin < 1 || intervalMin > 60) {
      showErrorPopup(SETTINGS_STRINGS.backupIntervalInvalid);
      return;
    }

    this.busy.set(true);
    try {
      await tournamentRepository.updateBackupInterval(intervalMin);
      this.tournament.update((current) =>
        current ? { ...current, backupIntervalMin: intervalMin } : current,
      );
      this.statusMessage.set(SETTINGS_STRINGS.backupIntervalSaved);
    } catch (error) {
      console.error('Saving backup interval failed', error);
      showErrorPopup(SETTINGS_STRINGS.backupIntervalSaveFailed);
    } finally {
      this.busy.set(false);
    }
  }

  protected backToPanel(): void {
    void this.router.navigateByUrl('/panel');
  }
}
