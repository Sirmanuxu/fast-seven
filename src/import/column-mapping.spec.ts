import { describe, expect, it } from 'vitest';
import {
  getMissingRequiredMappings,
  splitFullName,
  suggestColumnMapping,
} from './column-mapping';

describe('import column mapping', () => {
  it('suggests fields by header similarity', () => {
    const mapping = suggestColumnMapping([
      'Nombre',
      'Apellido',
      'Categoria',
      'Genero',
      'Equipo',
    ]);
    expect(mapping).toEqual({
      firstName: 'Nombre',
      lastName: 'Apellido',
      category: 'Categoria',
      gender: 'Genero',
      team: 'Equipo',
      fullName: null,
      splitMode: 'NONE',
    });
  });

  it('detects a full-name column', () => {
    const mapping = suggestColumnMapping(['Nombre completo', 'Categoria', 'Genero']);
    expect(mapping.fullName).toBe('Nombre completo');
    expect(mapping.splitMode).toBe('COMMA');
  });

  it('splits full names by comma or first space', () => {
    expect(splitFullName('Pérez, Juan', 'COMMA')).toEqual({
      firstName: 'Juan',
      lastName: 'Pérez',
    });
    expect(splitFullName('Juan José Pérez', 'FIRST_SPACE')).toEqual({
      firstName: 'Juan',
      lastName: 'José Pérez',
    });
  });

  it('requires first, last, category and gender fields', () => {
    expect(
      getMissingRequiredMappings({
        firstName: null,
        lastName: null,
        category: null,
        gender: null,
        team: null,
        fullName: null,
        splitMode: 'NONE',
      }),
    ).toEqual(['firstName', 'lastName', 'category', 'gender']);
  });
});
