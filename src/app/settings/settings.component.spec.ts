import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tournamentRepository } from '../../data/tournament-repository';
import { Tournament } from '../../domain/model';
import { SETTINGS_STRINGS } from '../../i18n/settings-strings';
import { SettingsComponent } from './settings.component';
import { activeErrorModal, dismissErrorModal } from '../error-popup';

function tournament(status: Tournament['status']): Tournament {
  return {
    id: 'tournament',
    name: 'Tournament',
    date: '2026-11-25T00:00:00.000Z',
    status,
    formatParams: null,
    rules: {
      points: {
        win: 3,
        draw: 2,
        loss: 1,
        walkoverLoss: 0,
        bonus: {
          triesThreshold: null,
          triesBonusPoints: 0,
          losingMarginMax: null,
          losingBonusPoints: 0,
        },
      },
      tiebreakers: ['DRAW'],
      walkoverScore: { winner: 28, loser: 0 },
      bye: { awardsWinPoints: true, countsScore: false },
      roster: { min: 7, max: 12 },
    },
    schedule: { startTime: null, matchDurationMin: 20, restMin: 5, breaks: [] },
    categories: [],
    backupIntervalMin: 10,
    schemaVersion: 1,
    createdAt: '2026-11-25T00:00:00.000Z',
    updatedAt: '2026-11-25T00:00:00.000Z',
  };
}

describe('SettingsComponent destructive actions', () => {
  let fixture: ComponentFixture<SettingsComponent>;

  beforeEach(async () => {
    vi.spyOn(tournamentRepository, 'getTournament').mockResolvedValue(tournament('RUNNING'));
    vi.spyOn(tournamentRepository, 'getTournamentFileState').mockResolvedValue({
      id: 'current',
      tournamentId: null,
      exportedAt: null,
      checksum: null,
      warningIntervalMin: 30,
    });
    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    dismissErrorModal();
    vi.restoreAllMocks();
  });

  function button(label: string): HTMLButtonElement {
    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
    const match = buttons.find((candidate) => candidate.textContent?.trim() === label);
    if (!match) throw new Error(`Button not found: ${label}`);
    return match;
  }

  it('requires the exact BORRAR confirmation before deleting the tournament', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('BORRAR ');
    const deleteTournament = vi
      .spyOn(tournamentRepository, 'deleteTournamentWithBackup')
      .mockResolvedValue();

    button('Nuevo torneo').click();
    await fixture.whenStable();

    expect(window.prompt).toHaveBeenCalledOnce();
    expect(deleteTournament).not.toHaveBeenCalled();
  });

  it('does not reset the fixture unless both confirmations are accepted', async () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true).mockReturnValueOnce(false);
    const resetFixture = vi.spyOn(tournamentRepository, 'resetFixture').mockResolvedValue();

    expect(button('Reiniciar fixture').disabled).toBe(false);
    button('Reiniciar fixture').click();
    await fixture.whenStable();

    expect(window.confirm).toHaveBeenCalledTimes(2);
    expect(resetFixture).not.toHaveBeenCalled();
  });

  it('resets the fixture after both confirmations are accepted', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const resetFixture = vi.spyOn(tournamentRepository, 'resetFixture').mockResolvedValue();

    button('Reiniciar fixture').click();
    await fixture.whenStable();

    expect(resetFixture).toHaveBeenCalledWith(expect.any(String));
    expect(fixture.nativeElement.textContent).toContain(
      'El fixture se reinició. Los jugadores y equipos siguen disponibles.',
    );
  });

  it('saves a backup interval within the supported range', async () => {
    const updateBackupInterval = vi
      .spyOn(tournamentRepository, 'updateBackupInterval')
      .mockResolvedValue();
    const input = (fixture.nativeElement as HTMLElement).querySelector(
      '#backup-interval',
    ) as HTMLInputElement;
    input.value = '3';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    button(SETTINGS_STRINGS.saveBackupInterval).click();
    await fixture.whenStable();

    expect(updateBackupInterval).toHaveBeenCalledWith(3);
  });

  it('rejects backup intervals outside the supported range', async () => {
    const updateBackupInterval = vi
      .spyOn(tournamentRepository, 'updateBackupInterval')
      .mockResolvedValue();
    const input = (fixture.nativeElement as HTMLElement).querySelector(
      '#backup-interval',
    ) as HTMLInputElement;
    input.value = '61';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    button(SETTINGS_STRINGS.saveBackupInterval).click();
    await fixture.whenStable();

    expect(updateBackupInterval).not.toHaveBeenCalled();
    expect(activeErrorModal()?.message).toBe(SETTINGS_STRINGS.backupIntervalInvalid);
  });

  it('saves a file warning interval within the supported range', async () => {
    const updateWarningInterval = vi
      .spyOn(tournamentRepository, 'updateFileWarningInterval')
      .mockResolvedValue();
    const input = (fixture.nativeElement as HTMLElement).querySelector(
      '#file-warning-interval',
    ) as HTMLInputElement;
    input.value = '60';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    button(SETTINGS_STRINGS.saveFileWarning).click();
    await fixture.whenStable();

    expect(updateWarningInterval).toHaveBeenCalledWith(60);
  });

  it('rejects file warning intervals outside the supported range', async () => {
    const updateWarningInterval = vi
      .spyOn(tournamentRepository, 'updateFileWarningInterval')
      .mockResolvedValue();
    const input = (fixture.nativeElement as HTMLElement).querySelector(
      '#file-warning-interval',
    ) as HTMLInputElement;
    input.value = '0';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    button(SETTINGS_STRINGS.saveFileWarning).click();
    await fixture.whenStable();

    expect(updateWarningInterval).not.toHaveBeenCalled();
    expect(activeErrorModal()?.message).toBe(SETTINGS_STRINGS.fileWarningInvalid);
  });
});
