import { Component, inject, OnInit, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { tournamentRepository } from '../../data/tournament-repository';
import { PERSISTENCE_STRINGS } from '../../i18n/persistence-strings';
import { APP_VERSION } from './app-version';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  protected readonly strings = PERSISTENCE_STRINGS;
  protected readonly ready = signal(false);
  protected readonly databaseAvailable = signal(true);
  protected readonly appVersion = APP_VERSION;
  private readonly router = inject(Router);
  private readonly swUpdate = inject(SwUpdate, { optional: true });

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
      this.ready.set(true);
      return;
    }

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
    this.ready.set(true);
  }
}
