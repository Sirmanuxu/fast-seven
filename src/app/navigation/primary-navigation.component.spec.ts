import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PrimaryNavigationComponent } from './primary-navigation.component';

describe('PrimaryNavigationComponent', () => {
  let fixture: ComponentFixture<PrimaryNavigationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrimaryNavigationComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(PrimaryNavigationComponent);
    fixture.detectChanges();
  });

  it('keeps every current operator destination available in the navigation', () => {
    const links = Array.from(
      fixture.nativeElement.querySelectorAll('nav a[href]') as NodeListOf<HTMLAnchorElement>,
    ).map((link) => link.getAttribute('href'));

    expect(links).toEqual([
      '#/panel',
      '#/panel',
      '#/panel/fixture',
      '#/jugadores',
      '#/panel/jugadores/importar',
      '#/equipos',
      '#/panel/reglas',
      '#/panel/formato',
      '#/panel/respaldo',
      '#/panel/ajustes',
    ]);
  });

  it('exposes and toggles the mobile navigation state accessibly', () => {
    const toggle = fixture.nativeElement.querySelector(
      '.mobile-navigation-toggle',
    ) as HTMLButtonElement;
    const navigation = fixture.nativeElement.querySelector('nav') as HTMLElement;

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(navigation.classList.contains('is-open')).toBe(true);

    const scrim = fixture.nativeElement.querySelector('.navigation-scrim') as HTMLButtonElement;
    scrim.click();
    fixture.detectChanges();

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(navigation.classList.contains('is-open')).toBe(false);
  });
});
