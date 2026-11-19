import { describe, expect, it } from 'vitest';
import { Player } from './model';
import {
  capitalizeName,
  normalizePlayerKey,
  normalizeWhitespace,
  validatePlayerInput,
} from './player';

describe('player normalization', () => {
  it('normalizes accents, case, apostrophes, hyphens and whitespace', () => {
    expect(normalizePlayerKey("  JUAN  O'Hara ", 'Pérez-De   León', 'M16')).toBe(
      'juan ohara|perez de leon|m16',
    );
  });

  it('trims and collapses whitespace', () => {
    expect(normalizeWhitespace('  Juan   Ignacio  ')).toBe('Juan Ignacio');
  });

  it('capitalizes words including hyphenated names', () => {
    expect(capitalizeName('  juan  jOSE  ')).toBe('Juan Jose');
    expect(capitalizeName('perez-de león')).toBe('Perez-De León');
  });

  it('rejects missing required fields', () => {
    const result = validatePlayerInput(
      {
        firstName: '',
        lastName: 'Pérez',
        category: 'M16',
        gender: 'M',
        teamId: null,
      },
      [],
    );

    expect(result.ok).toBe(false);
  });

  it('detects a normalized duplicate without matching the edited player', () => {
    const player: Player = {
      id: 'player-1',
      firstName: 'Juan',
      lastName: 'Pérez',
      category: 'M16',
      gender: 'M',
      teamId: null,
      disambiguation: null,
      normalizedKey: normalizePlayerKey('Juan', 'Pérez', 'M16'),
    };

    const duplicate = validatePlayerInput(
      {
        firstName: 'juan',
        lastName: 'perez',
        category: 'M16',
        gender: 'M',
        teamId: null,
      },
      [player],
    );
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.error.code).toBe('DUPLICATE_PLAYER');
    }

    expect(
      validatePlayerInput(
        {
          firstName: 'juan',
          lastName: 'perez',
          category: 'M16',
          gender: 'M',
          teamId: null,
        },
        [player],
        'player-1',
      ).ok,
    ).toBe(true);
  });
});
