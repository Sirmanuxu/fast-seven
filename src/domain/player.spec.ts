import { describe, expect, it } from 'vitest';
import { Player } from './model';
import {
  capitalizeName,
  findNormalizedDuplicates,
  getNextHomonymDisambiguation,
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

  it('finds accent, case and apostrophe variants as the same normalized player', () => {
    const player: Player = {
      id: 'player-1',
      firstName: 'José',
      lastName: "O'Connor",
      category: 'M16',
      gender: 'M',
      teamId: null,
      disambiguation: null,
      normalizedKey: normalizePlayerKey('Jose', 'OConnor', 'M16'),
    };

    expect(
      findNormalizedDuplicates(
        { firstName: ' JOSE ', lastName: 'Pérez-Gómez', category: 'M16' },
        [player],
      ),
    ).toEqual([]);

    expect(
      findNormalizedDuplicates(
        { firstName: 'Jose', lastName: "O'Connor", category: 'M16' },
        [player],
      ),
    ).toHaveLength(1);
  });

  it('generates the next homonym disambiguation', () => {
    const first: Player = {
      id: '1',
      firstName: 'Juan',
      lastName: 'Pérez',
      category: 'M16',
      gender: 'M',
      teamId: null,
      disambiguation: null,
      normalizedKey: normalizePlayerKey('Juan', 'Pérez', 'M16'),
    };
    const second: Player = { ...first, id: '2', disambiguation: '(2)' };
    const third: Player = { ...first, id: '3', disambiguation: '(3)' };
    expect(
      getNextHomonymDisambiguation(first.normalizedKey, [first, second, third]),
    ).toBe('(4)');
  });
});
