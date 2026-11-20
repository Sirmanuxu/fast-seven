import { describe, expect, it } from 'vitest';
import { detectCsvDelimiter, detectCsvEncoding } from './file-reader';

describe('CSV file detection', () => {
  it('detects semicolon, comma and tab delimiters', () => {
    expect(detectCsvDelimiter('Nombre;Apellido;Categoria;Genero;Equipo')).toBe(';');
    expect(detectCsvDelimiter('Nombre,Apellido,Categoria,Genero,Equipo')).toBe(',');
    expect(detectCsvDelimiter('Nombre\tApellido\tCategoria\tGenero\tEquipo')).toBe('\t');
  });

  it('keeps commas inside quoted fields', () => {
    expect(detectCsvDelimiter('Nombre;Apellido\n"Pérez, Juan";Pérez')).toBe(';');
  });

  it('detects UTF-8 BOM', () => {
    expect(
      detectCsvEncoding(new Uint8Array([0xef, 0xbb, 0xbf, 0x4e, 0x6f, 0x6d, 0x62, 0x72, 0x65])),
    ).toBe('UTF-8');
  });

  it('detects Windows-1252 bytes', () => {
    expect(detectCsvEncoding(new Uint8Array([0x50, 0xe9, 0x72, 0x65, 0x7a]))).toBe('Windows-1252');
  });
});
