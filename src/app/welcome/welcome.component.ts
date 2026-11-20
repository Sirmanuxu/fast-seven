import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tournamentRepository } from '../../data/tournament-repository';
import { PERSISTENCE_STRINGS } from '../../i18n/persistence-strings';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_TIEBREAKERS,
  PRESET_POINTS_3_2_1,
  Tournament,
} from '../../domain/model';

@Component({
  selector: 'app-welcome',
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.css',
})
export class WelcomeComponent implements OnInit {
  protected readonly strings = PERSISTENCE_STRINGS;
  protected readonly tournamentName = signal('');
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly persistenceNotice = signal<string | null>(null);
  private readonly router = inject(Router);

  async ngOnInit(): Promise<void> {
    const tournament = await tournamentRepository.getTournament();
    if (tournament) {
      await this.router.navigateByUrl(localStorage.getItem('fast-seven-last-screen') ?? '/panel');
    }
  }

  protected async createTournament(): Promise<void> {
    const name = this.tournamentName().trim();
    if (!name) {
      this.errorMessage.set(PERSISTENCE_STRINGS.nameRequired);
      return;
    }

    const now = new Date().toISOString();
    const tournament: Tournament = {
      id: crypto.randomUUID(),
      name,
      date: now,
      status: 'SETUP',
      formatParams: null,
      rules: {
        points: PRESET_POINTS_3_2_1,
        tiebreakers: DEFAULT_TIEBREAKERS,
        walkoverScore: { winner: 28, loser: 0 },
        bye: { awardsWinPoints: true, countsScore: false },
        roster: { min: 7, max: 12 },
      },
      schedule: {
        startTime: null,
        matchDurationMin: 40,
        restMin: 10,
        breaks: [],
      },
      categories: DEFAULT_CATEGORIES,
      backupIntervalMin: 5,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await tournamentRepository.createTournament(tournament);
      await this.requestPersistentStorage();
      localStorage.setItem('fast-seven-last-screen', '/panel');
      await this.router.navigateByUrl('/panel');
    } catch {
      this.errorMessage.set(PERSISTENCE_STRINGS.createFailed);
    }
  }

  private async requestPersistentStorage(): Promise<void> {
    if (!navigator.storage?.persist) {
      localStorage.setItem('fast-seven-persistence-result', 'unsupported');
      return;
    }

    const granted = await navigator.storage.persist();
    localStorage.setItem('fast-seven-persistence-result', granted ? 'granted' : 'denied');
    if (!granted) {
      this.persistenceNotice.set(PERSISTENCE_STRINGS.persistenceDenied);
    }
  }
}
