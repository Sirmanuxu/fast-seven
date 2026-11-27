import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tournamentRepository } from '../../data/tournament-repository';
import { Backup } from '../../domain/model';
import { BACKUP_STRINGS } from '../../i18n/backup-strings';
import { BackupsComponent } from './backups.component';

const backup: Backup = {
  id: 'backup',
  createdAt: '2026-11-27T00:00:00.000Z',
  reason: 'PERIODIC',
  snapshot: {
    tournament: {
      id: 'tournament',
      name: 'Tournament',
      date: '2026-11-27T00:00:00.000Z',
      status: 'RUNNING',
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
      backupIntervalMin: 5,
      schemaVersion: 1,
      createdAt: '2026-11-27T00:00:00.000Z',
      updatedAt: '2026-11-27T00:00:00.000Z',
    },
    players: [],
    teams: [],
    stages: [],
    groups: [],
    matches: [
      {
        id: 'finished-match',
        stageId: 'stage',
        groupId: null,
        round: 1,
        order: 1,
        label: null,
        home: { kind: 'BYE' },
        away: { kind: 'BYE' },
        status: 'FINISHED',
        result: null,
        startedAt: null,
        finishedAt: null,
        isPhantom: false,
        isConditional: false,
      },
    ],
    events: [],
    draws: [],
  },
};

describe('BackupsComponent', () => {
  let fixture: ComponentFixture<BackupsComponent>;

  beforeEach(async () => {
    vi.spyOn(tournamentRepository, 'getBackups').mockResolvedValue([backup]);
    await TestBed.configureTestingModule({
      imports: [BackupsComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(BackupsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function restoreButton(): HTMLButtonElement {
    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
    const button = buttons.find(
      (candidate) => candidate.textContent?.trim() === BACKUP_STRINGS.restore,
    );
    if (!button) throw new Error('Restore button not found');
    return button;
  }

  it('shows the reason and finished-match summary for each backup', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Copia periódica');
    expect(text).toContain('1 partidos finalizados');
  });

  it('requires confirmation before restoring a backup', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const restoreBackup = vi.spyOn(tournamentRepository, 'restoreBackup').mockResolvedValue();

    restoreButton().click();
    await fixture.whenStable();

    expect(window.confirm).toHaveBeenCalledWith(BACKUP_STRINGS.confirmRestore);
    expect(restoreBackup).not.toHaveBeenCalled();
  });

  it('restores a confirmed backup and reports success', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const restoreBackup = vi.spyOn(tournamentRepository, 'restoreBackup').mockResolvedValue();

    restoreButton().click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(restoreBackup).toHaveBeenCalledWith('backup', expect.any(String));
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(BACKUP_STRINGS.restored);
  });
});
