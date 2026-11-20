export type ImportMappedField =
  | 'firstName'
  | 'lastName'
  | 'category'
  | 'gender'
  | 'team';

export type FullNameSplitMode = 'NONE' | 'COMMA' | 'FIRST_SPACE';

export interface ImportColumnMapping {
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly category: string | null;
  readonly gender: string | null;
  readonly team: string | null;
  readonly fullName: string | null;
  readonly splitMode: FullNameSplitMode;
}

export const EMPTY_IMPORT_MAPPING: ImportColumnMapping = {
  firstName: null,
  lastName: null,
  category: null,
  gender: null,
  team: null,
  fullName: null,
  splitMode: 'NONE',
};

const FIELD_HEADER_ALIASES: Readonly<Record<ImportMappedField, readonly string[]>> = {
  firstName: ['nombre', 'nombres', 'name', 'firstname', 'primer nombre'],
  lastName: ['apellido', 'apellidos', 'surname', 'lastname', 'last name'],
  category: ['categoria', 'categoría', 'category', 'cat'],
  gender: ['genero', 'género', 'sexo', 'gender', 'm/f'],
  team: ['equipo', 'team', 'club', 'plantel'],
};

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function editDistance(left: string, right: string): number {
  const matrix = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  );
  for (let row = 0; row <= left.length; row += 1) matrix[row][0] = row;
  for (let column = 0; column <= right.length; column += 1) matrix[0][column] = column;
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      matrix[row][column] =
        left[row - 1] === right[column - 1]
          ? matrix[row - 1][column - 1]
          : 1 +
            Math.min(
              matrix[row - 1][column],
              matrix[row - 1][column - 1],
              matrix[row][column],
            );
    }
  }
  return matrix[left.length][right.length];
}

export function suggestColumnMapping(
  headers: readonly string[],
): ImportColumnMapping {
  const fullNameHeader = headers.find((header) =>
    ['nombre completo', 'nombre y apellido', 'fullname', 'full name'].includes(
      normalizeHeader(header),
    ),
  );
  if (fullNameHeader) {
    const remainingHeaders = headers.filter((header) => header !== fullNameHeader);
    const mapping = suggestColumnMapping(remainingHeaders);
    return {
      firstName: null,
      lastName: null,
      category: mapping.category ?? null,
      gender: mapping.gender ?? null,
      team: mapping.team ?? null,
      fullName: fullNameHeader,
      splitMode: 'COMMA',
    };
  }

  const mapping: Partial<Record<ImportMappedField, string | null>> = {};

  for (const field of Object.keys(FIELD_HEADER_ALIASES) as ImportMappedField[]) {
    let bestHeader: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const header of headers) {
      const normalizedHeader = normalizeHeader(header);
      for (const alias of FIELD_HEADER_ALIASES[field]) {
        const normalizedAlias = normalizeHeader(alias);
        const distance =
          normalizedHeader === normalizedAlias
            ? 0
            : normalizedHeader.includes(normalizedAlias)
              ? 1
              : editDistance(normalizedHeader, normalizedAlias);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestHeader = header;
        }
      }
    }
    mapping[field] =
      bestHeader && bestDistance <= Math.max(3, normalizeHeader(bestHeader).length)
        ? bestHeader
        : null;
  }

  return {
    firstName: mapping.firstName ?? null,
    lastName: mapping.lastName ?? null,
    category: mapping.category ?? null,
    gender: mapping.gender ?? null,
    team: mapping.team ?? null,
    fullName: null,
    splitMode: 'NONE',
  };
}

export function splitFullName(
  value: string,
  mode: FullNameSplitMode,
): { readonly firstName: string; readonly lastName: string } {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (mode === 'COMMA' && normalized.includes(',')) {
    const [lastName, firstName] = normalized.split(',', 2).map((part) => part.trim());
    return { firstName: firstName ?? '', lastName: lastName ?? '' };
  }
  if (mode === 'FIRST_SPACE') {
    const firstSpace = normalized.indexOf(' ');
    if (firstSpace >= 0) {
      return {
        firstName: normalized.slice(0, firstSpace).trim(),
        lastName: normalized.slice(firstSpace + 1).trim(),
      };
    }
  }
  return { firstName: normalized, lastName: '' };
}

export function getMissingRequiredMappings(
  mapping: ImportColumnMapping,
): readonly ('firstName' | 'lastName' | 'category' | 'gender')[] {
  const missing: ('firstName' | 'lastName' | 'category' | 'gender')[] = [];
  if (!mapping.fullName && !mapping.firstName) missing.push('firstName');
  if (!mapping.fullName && !mapping.lastName) missing.push('lastName');
  if (mapping.fullName && mapping.splitMode === 'NONE') {
    missing.push('firstName', 'lastName');
  }
  if (!mapping.category) missing.push('category');
  if (!mapping.gender) missing.push('gender');
  return missing;
}

export function mappingSignature(headers: readonly string[]): string {
  return headers.map(normalizeHeader).join('|');
}
