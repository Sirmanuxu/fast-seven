import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tournamentRepository } from '../../data/tournament-repository';
import { createTournamentFile } from '../../data/tournament-file';
import { TournamentSnapshot } from '../../domain/model';
import { TOURNAMENT_FILE_STRINGS } from '../../i18n/tournament-file-strings';
import { TournamentFileBarComponent } from './tournament-file-bar.component';
import { activeErrorModal, dismissErrorModal } from '../error-popup';

function snapshot(name = 'Tournament'): TournamentSnapshot {
  const timestamp = '2026-11-25T00:00:00.000Z';
  return {
    tournament: {
      id: 'tournament',
      name,
      date: timestamp,
      status: 'SETUP',
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
      schemaVersion: 2,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    players: [],
    teams: [],
    stages: [],
    groups: [],
    matches: [],
    events: [],
    draws: [],
  };
}

describe('TournamentFileBarComponent loading', () => {
  let fixture: ComponentFixture<TournamentFileBarComponent>;

  beforeEach(async () => {
    vi.spyOn(tournamentRepository, 'getSnapshot').mockResolvedValue(snapshot());
    vi.spyOn(tournamentRepository, 'getTournamentFileState').mockResolvedValue({
      id: 'current',
      tournamentId: null,
      exportedAt: null,
      checksum: null,
      warningIntervalMin: 30,
    });
    await TestBed.configureTestingModule({
      imports: [TournamentFileBarComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(TournamentFileBarComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    dismissErrorModal();
    vi.restoreAllMocks();
  });

  async function selectFile(content: string): Promise<void> {
    const file = new File([content], 'tournament.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(content) });
    const input = { files: [file], value: 'tournament.json' };
    const event = new Event('change');
    Object.defineProperty(event, 'target', { value: input });
    const component = fixture.componentInstance as unknown as {
      onTournamentFileSelected(event: Event): Promise<void>;
    };
    await component.onTournamentFileSelected(event);
    fixture.detectChanges();
  }

  it('does not replace data when the operator cancels after reviewing the summary', async () => {
    const imported = await createTournamentFile(
      snapshot('Imported tournament'),
      '0.49.0',
      '2026-11-27T00:00:00.000Z',
    );
    const loadTournamentFile = vi
      .spyOn(tournamentRepository, 'loadTournamentFile')
      .mockResolvedValue();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await selectFile(JSON.stringify(imported));
    await vi.waitFor(() => expect(window.confirm).toHaveBeenCalled());

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining('Torneo: Imported tournament'),
    );
    expect(loadTournamentFile).not.toHaveBeenCalled();
  });

  it('rejects a corrupt file without asking to replace the current tournament', async () => {
    const imported = await createTournamentFile(
      snapshot('Imported tournament'),
      '0.49.0',
      '2026-11-27T00:00:00.000Z',
    );
    const loadTournamentFile = vi
      .spyOn(tournamentRepository, 'loadTournamentFile')
      .mockResolvedValue();
    const confirm = vi.spyOn(window, 'confirm');

    await selectFile(JSON.stringify({ ...imported, checksum: '0'.repeat(64) }));
    await vi.waitFor(() => expect(activeErrorModal()).not.toBeNull());

    expect(activeErrorModal()?.message).toBe(TOURNAMENT_FILE_STRINGS.checksumMismatch);
    expect(confirm).not.toHaveBeenCalled();
    expect(loadTournamentFile).not.toHaveBeenCalled();
  });

  it('loads the validated file after explicit confirmation', async () => {
    const imported = await createTournamentFile(
      snapshot('Imported tournament'),
      '0.49.0',
      '2026-11-27T00:00:00.000Z',
    );
    const loadTournamentFile = vi
      .spyOn(tournamentRepository, 'loadTournamentFile')
      .mockResolvedValue();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await selectFile(JSON.stringify(imported));
    await vi.waitFor(() => expect(loadTournamentFile).toHaveBeenCalled());

    expect(loadTournamentFile).toHaveBeenCalledWith(imported);
  });
});
