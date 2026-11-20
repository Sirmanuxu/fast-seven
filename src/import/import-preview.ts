import { Category, Gender, ImportRowStatus, Player, Team, Warning } from '../domain/model';
import { capitalizeName, normalizePlayerKey } from '../domain/player';
import { normalizeTeamName } from '../domain/team';

export interface ImportPreviewRow {
  readonly rowNumber: number;
  readonly raw: Readonly<Record<string, string>>;
  readonly firstName: string;
  readonly lastName: string;
  readonly categoryRaw: string;
  readonly genderRaw: string;
  readonly teamNameRaw: string;
  readonly normalizedCategory: string | null;
  readonly normalizedGender: Gender | null;
  readonly normalizedTeamName: string | null;
  readonly status: ImportRowStatus;
  readonly issues: readonly Warning[];
  readonly discarded: boolean;
  readonly duplicateInFile: boolean;
  readonly differentPerson: boolean;
  readonly duplicateExisting: boolean;
  readonly teamIsNew: boolean;
  readonly teamIsSimilar: boolean;
}

function normalizeText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');
}

export function normalizeImportCategory(raw: string, catalog: readonly Category[]): string | null {
  const value = normalizeText(raw);
  if (!value) return null;
  if (raw.trim() === '+35') return 'VETERANOS';

  const aliases = new Map<string, string>();
  for (const category of catalog) {
    aliases.set(normalizeText(category.code), category.code);
    aliases.set(normalizeText(category.label), category.code);
    for (const alias of category.aliases) {
      aliases.set(normalizeText(alias), category.code);
    }
  }

  const numericMatch = /^(?:(?:m|sub)\s*-?\s*)?(\d+)$/i.exec(value);
  if (numericMatch) {
    const number = Number.parseInt(numericMatch[1], 10);
    if (number >= 7 && number <= 19) {
      return `M${number}`;
    }
  }

  if (value === 'escuelita') return aliases.get(value) ?? 'ESCUELITA';
  if (['plantel superior', 'primera', 'intermedia', 'preintermedia'].includes(value)) {
    return aliases.get(value) ?? 'PLANTEL_SUPERIOR';
  }
  if (['veteranos', 'vet', '+35'].includes(value)) {
    return aliases.get(value) ?? 'VETERANOS';
  }

  return aliases.get(value) ?? null;
}

export function normalizeImportGender(raw: string): Gender | null {
  const value = normalizeText(raw);
  if (['m', 'masc', 'masculino', 'varon'].includes(value)) return 'M';
  if (['f', 'fem', 'femenino', 'mujer'].includes(value)) return 'F';
  return null;
}

export function editDistance(left: string, right: string): number {
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
          : 1 + Math.min(matrix[row - 1][column], matrix[row - 1][column - 1], matrix[row][column]);
    }
  }
  return matrix[left.length][right.length];
}

export interface MappedImportRow {
  readonly firstName: string;
  readonly lastName: string;
  readonly categoryRaw: string;
  readonly genderRaw: string;
  readonly teamNameRaw: string;
}

export function buildImportPreview(
  rows: readonly MappedImportRow[],
  catalog: readonly Category[],
  existingPlayers: readonly Player[],
  existingTeams: readonly Team[],
): readonly ImportPreviewRow[] {
  const seenKeys = new Set<string>();
  return rows.map((row, index) => {
    const firstName = capitalizeName(row.firstName);
    const lastName = capitalizeName(row.lastName);
    const category = normalizeImportCategory(row.categoryRaw, catalog);
    const gender = normalizeImportGender(row.genderRaw);
    const teamName = row.teamNameRaw.trim() ? row.teamNameRaw.trim().replace(/\s+/g, ' ') : null;
    const issues: Warning[] = [];
    let status: ImportRowStatus = 'OK';

    if (!firstName || !lastName) {
      status = 'ERROR';
      issues.push({
        code: 'MISSING_PLAYER_FIELD',
        messageKey: 'import.missingRequiredField',
      });
    }
    if (!category) {
      status = 'ERROR';
      issues.push({
        code: 'UNKNOWN_CATEGORY',
        messageKey: 'import.unknownCategory',
      });
    }
    if (!gender) {
      status = 'ERROR';
      issues.push({
        code: 'UNKNOWN_GENDER',
        messageKey: 'import.unknownGender',
      });
    }

    const normalizedKey =
      firstName && lastName && category ? normalizePlayerKey(firstName, lastName, category) : null;
    const duplicateExisting =
      normalizedKey !== null &&
      existingPlayers.some(
        (player) => player.normalizedKey === normalizedKey && player.disambiguation === null,
      );
    const duplicateInFile = normalizedKey !== null && seenKeys.has(normalizedKey);
    if (normalizedKey) seenKeys.add(normalizedKey);

    let teamIsNew = false;
    let teamIsSimilar = false;
    if (teamName) {
      const normalizedTeam = normalizeTeamName(teamName);
      const exactTeam = existingTeams.find(
        (team) => normalizeTeamName(team.name) === normalizedTeam,
      );
      teamIsNew = !exactTeam;
      if (!exactTeam) {
        teamIsSimilar = existingTeams.some((team) => {
          const existing = normalizeTeamName(team.name);
          return existing !== normalizedTeam && editDistance(existing, normalizedTeam) <= 2;
        });
      }
    }

    if (duplicateExisting || duplicateInFile || teamIsNew || teamIsSimilar) {
      if (status !== 'ERROR') status = 'WARNING';
      if (duplicateExisting) {
        issues.push({
          code: 'DUPLICATE_EXISTING_PLAYER',
          messageKey: 'import.duplicateExisting',
        });
      }
      if (duplicateInFile) {
        issues.push({
          code: 'DUPLICATE_IN_FILE',
          messageKey: 'import.duplicateInFile',
        });
      }
      if (teamIsNew) {
        issues.push({
          code: 'NEW_TEAM',
          messageKey: 'import.newTeam',
        });
      }
      if (teamIsSimilar) {
        issues.push({
          code: 'SIMILAR_TEAM',
          messageKey: 'import.similarTeam',
        });
      }
    }

    return {
      rowNumber: index + 2,
      raw: {
        firstName: row.firstName,
        lastName: row.lastName,
        category: row.categoryRaw,
        gender: row.genderRaw,
        team: row.teamNameRaw,
      },
      firstName,
      lastName,
      categoryRaw: row.categoryRaw,
      genderRaw: row.genderRaw,
      teamNameRaw: row.teamNameRaw,
      normalizedCategory: category,
      normalizedGender: gender,
      normalizedTeamName: teamName,
      status,
      issues,
      discarded: duplicateInFile,
      duplicateInFile,
      differentPerson: false,
      duplicateExisting,
      teamIsNew,
      teamIsSimilar,
    };
  });
}
