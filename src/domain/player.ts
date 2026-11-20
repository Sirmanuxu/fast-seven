import { Gender, Player } from './model';

export function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function capitalizeName(value: string): string {
  const normalized = normalizeWhitespace(value);
  return normalized
    .toLocaleLowerCase('es')
    .replace(
      /(^|[\s-])([a-záéíóúüñ])/g,
      (_match, separator: string, letter: string) =>
        `${separator}${letter.toLocaleUpperCase('es')}`,
    );
}

export function normalizePlayerKey(firstName: string, lastName: string, category: string): string {
  const normalize = (value: string): string =>
    normalizeWhitespace(value)
      .replace(/'/g, '')
      .replace(/-/g, ' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es')
      .replace(/\s+/g, ' ');

  return [normalize(firstName), normalize(lastName), normalize(category)].join('|');
}

export interface PlayerInput {
  readonly firstName: string;
  readonly lastName: string;
  readonly category: string;
  readonly gender: Gender;
  readonly teamId: string | null;
}

export interface PlayerValidationError {
  readonly code: 'REQUIRED_FIELD' | 'DUPLICATE_PLAYER';
  readonly message: string;
  readonly duplicate?: Player;
}

export type PlayerValidationResult =
  | { readonly ok: true; readonly playerInput: PlayerInput }
  | { readonly ok: false; readonly error: PlayerValidationError };

export function findNormalizedDuplicates(
  player: Pick<Player, 'firstName' | 'lastName' | 'category'>,
  existingPlayers: readonly Player[],
  excludePlayerId: string | null = null,
): readonly Player[] {
  const key = normalizePlayerKey(player.firstName, player.lastName, player.category);
  return existingPlayers.filter(
    (existing) => existing.id !== excludePlayerId && existing.normalizedKey === key,
  );
}

export function getNextHomonymDisambiguation(
  normalizedKey: string,
  existingPlayers: readonly Player[],
): string {
  const numbers = existingPlayers
    .filter((player) => player.normalizedKey === normalizedKey)
    .map((player) => {
      const match = /^\((\d+)\)$/.exec(player.disambiguation ?? '');
      return match ? Number.parseInt(match[1], 10) : 1;
    });
  const next = numbers.length === 0 ? 2 : Math.max(...numbers) + 1;
  return `(${next})`;
}

export function validatePlayerInput(
  input: PlayerInput,
  existingPlayers: readonly Player[],
  editingPlayerId: string | null = null,
): PlayerValidationResult {
  const firstName = capitalizeName(input.firstName);
  const lastName = capitalizeName(input.lastName);
  const category = input.category.trim();

  if (!firstName || !lastName || !category || !input.gender) {
    return {
      ok: false,
      error: {
        code: 'REQUIRED_FIELD',
        message: 'Completá nombre, apellido, categoría y género.',
      },
    };
  }

  const normalizedKey = normalizePlayerKey(firstName, lastName, category);
  const duplicate = existingPlayers.find(
    (player) => player.id !== editingPlayerId && player.normalizedKey === normalizedKey,
  );
  if (duplicate) {
    return {
      ok: false,
      error: {
        code: 'DUPLICATE_PLAYER',
        message: 'Ya existe un jugador con ese nombre, apellido y categoría.',
        duplicate,
      },
    };
  }

  return {
    ok: true,
    playerInput: {
      firstName,
      lastName,
      category,
      gender: input.gender,
      teamId: input.teamId,
    },
  };
}
