import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { NAVIGATION_STRINGS } from '../../i18n/navigation-strings';

@Component({
  selector: 'app-primary-navigation',
  templateUrl: './primary-navigation.component.html',
  styleUrl: './primary-navigation.component.css',
})
export class PrimaryNavigationComponent implements OnInit {
  protected readonly strings = NAVIGATION_STRINGS;
  protected readonly navigationSections = [
    {
      title: NAVIGATION_STRINGS.operation,
      links: [
        { label: NAVIGATION_STRINGS.panel, path: '/panel' },
        { label: NAVIGATION_STRINGS.fixture, path: '/panel/fixture' },
      ],
    },
    {
      title: NAVIGATION_STRINGS.preparation,
      links: [
        { label: NAVIGATION_STRINGS.players, path: '/jugadores' },
        { label: NAVIGATION_STRINGS.importPlayers, path: '/panel/jugadores/importar' },
        { label: NAVIGATION_STRINGS.teams, path: '/equipos' },
        { label: NAVIGATION_STRINGS.rules, path: '/panel/reglas' },
        { label: NAVIGATION_STRINGS.format, path: '/panel/formato' },
      ],
    },
    {
      title: NAVIGATION_STRINGS.system,
      links: [
        { label: NAVIGATION_STRINGS.backups, path: '/panel/respaldo' },
        { label: NAVIGATION_STRINGS.settings, path: '/panel/ajustes' },
      ],
    },
  ] as const;
  protected readonly mobileNavigationOpen = signal(false);
  protected readonly currentRoute = signal('/');
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.updateRoute(this.router.url);
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => this.updateRoute(event.urlAfterRedirects));
  }

  protected toggleNavigation(): void {
    this.mobileNavigationOpen.update((open) => !open);
  }

  protected closeNavigation(): void {
    this.mobileNavigationOpen.set(false);
  }

  private updateRoute(url: string): void {
    this.currentRoute.set(url.split('?')[0]);
    this.mobileNavigationOpen.set(false);
  }
}
