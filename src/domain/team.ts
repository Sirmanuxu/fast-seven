import { Player, RosterLimits, Team, TournamentStatus } from './model';
import { normalizeWhitespace } from './player';

export function normalizeTeamName(value: string): string {
  return normalizeWhitespace(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');
}

export function isValidTeamColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

function hexToRgb(hex: string): readonly [number, number, number] | null {
  if (!isValidTeamColor(hex)) {
    return null;
  }
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

export function areTeamColorsTooSimilar(primary: string, secondary: string): boolean {
  const first = hexToRgb(primary);
  const second = hexToRgb(secondary);
  if (!first || !second) {
    return false;
  }

  const distance = Math.sqrt(
    (first[0] - second[0]) ** 2 + (first[1] - second[1]) ** 2 + (first[2] - second[2]) ** 2,
  );
  return distance < 72;
}

export type RosterState = 'BELOW_MINIMUM' | 'ABOVE_MAXIMUM' | 'OK';

export interface RosterStatus {
  readonly count: number;
  readonly state: RosterState;
  readonly label: 'rojo' | 'amarillo' | 'verde';
}

export function getRosterStatus(
  players: readonly Player[],
  teamId: string,
  limits: RosterLimits,
): RosterStatus {
  const count = players.filter((player) => player.teamId === teamId).length;
  if (count < limits.min) {
    return { count, state: 'BELOW_MINIMUM', label: 'rojo' };
  }
  if (limits.max !== null && count > limits.max) {
    return { count, state: 'ABOVE_MAXIMUM', label: 'amarillo' };
  }
  return { count, state: 'OK', label: 'verde' };
}

export interface TeamValidationError {
  readonly code: 'REQUIRED_NAME' | 'DUPLICATE_NAME' | 'INVALID_COLOR' | 'INVALID_CAPTAIN';
  readonly message: string;
}

export type TeamValidationResult =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly error: TeamValidationError };

export function validateTeamInput(input: {
  readonly name: string;
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly captainId: string | null;
  readonly teamId: string | null;
  readonly players: readonly Player[];
  readonly teams: readonly Team[];
}): TeamValidationResult {
  const name = normalizeWhitespace(input.name);
  if (!name) {
    return {
      ok: false,
      error: { code: 'REQUIRED_NAME', message: 'Ingresá el nombre del equipo.' },
    };
  }

  const normalizedName = normalizeTeamName(name);
  const duplicate = input.teams.find(
    (team) => team.id !== input.teamId && normalizeTeamName(team.name) === normalizedName,
  );
  if (duplicate) {
    return {
      ok: false,
      error: { code: 'DUPLICATE_NAME', message: 'Ya existe un equipo con ese nombre.' },
    };
  }

  if (!isValidTeamColor(input.primaryColor) || !isValidTeamColor(input.secondaryColor)) {
    return {
      ok: false,
      error: { code: 'INVALID_COLOR', message: 'Los colores deben tener formato #RRGGBB.' },
    };
  }

  if (
    input.captainId &&
    !input.players.some((player) => player.id === input.captainId && player.teamId === input.teamId)
  ) {
    return {
      ok: false,
      error: {
        code: 'INVALID_CAPTAIN',
        message: 'El capitán debe ser un jugador asignado al equipo.',
      },
    };
  }

  return { ok: true, name };
}

export function canCreateOrDeleteTeam(status: TournamentStatus): boolean {
  return status === 'SETUP' || status === 'FIXTURE_GENERATED';
}

export function hasMixedRoster(players: readonly Player[], teamId: string): boolean {
  const teamPlayers = players.filter((player) => player.teamId === teamId);
  const categories = new Set(teamPlayers.map((player) => player.category));
  const genders = new Set(teamPlayers.map((player) => player.gender));
  return categories.size > 1 || genders.size > 1;
}
