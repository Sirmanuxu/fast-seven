import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '../domain/model';
import {
  buildImportPreview,
  normalizeImportCategory,
  normalizeImportGender,
} from './import-preview';

describe('import normalization', () => {
  it('normalizes category aliases and numeric forms', () => {
    expect(normalizeImportCategory('Sub16', DEFAULT_CATEGORIES)).toBe('M16');
    expect(normalizeImportCategory('M 16', DEFAULT_CATEGORIES)).toBe('M16');
    expect(normalizeImportCategory('sub-16', DEFAULT_CATEGORIES)).toBe('M16');
    expect(normalizeImportCategory('escuelita', DEFAULT_CATEGORIES)).toBe('ESCUELITA');
    expect(normalizeImportCategory('Intermedia', DEFAULT_CATEGORIES)).toBe('PLANTEL_SUPERIOR');
    expect(normalizeImportCategory('+35', DEFAULT_CATEGORIES)).toBe('VETERANOS');
  });

  it('rejects categories outside the catalog', () => {
    expect(normalizeImportCategory('M20', DEFAULT_CATEGORIES)).toBeNull();
    expect(normalizeImportCategory('M6', DEFAULT_CATEGORIES)).toBeNull();
    expect(normalizeImportCategory('abc', DEFAULT_CATEGORIES)).toBeNull();
  });

  it('normalizes gender aliases', () => {
    expect(normalizeImportGender('Masc')).toBe('M');
    expect(normalizeImportGender('Varón')).toBe('M');
    expect(normalizeImportGender('Mujer')).toBe('F');
    expect(normalizeImportGender('X')).toBeNull();
  });

  it('marks missing fields and duplicate rows', () => {
    const rows = buildImportPreview(
      [
        { firstName: 'Ana', lastName: '', categoryRaw: 'M16', genderRaw: 'F', teamNameRaw: '' },
        {
          firstName: 'Ana',
          lastName: 'Lopez',
          categoryRaw: 'Sub16',
          genderRaw: 'Fem',
          teamNameRaw: 'Lobos',
        },
        {
          firstName: 'Ana',
          lastName: 'Lopez',
          categoryRaw: 'M16',
          genderRaw: 'F',
          teamNameRaw: 'Lobos',
        },
      ],
      DEFAULT_CATEGORIES,
      [],
      [],
    );

    expect(rows[0].status).toBe('ERROR');
    expect(rows[1].normalizedCategory).toBe('M16');
    expect(rows[1].normalizedGender).toBe('F');
    expect(rows[1].status).toBe('WARNING');
    expect(rows[2].duplicateInFile).toBe(true);
    expect(rows[2].discarded).toBe(true);
  });
});
