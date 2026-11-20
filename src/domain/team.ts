import { Player, RosterLimits, Team, TournamentStatus } from './model';
import { normalizeWhitespace } from './player';

export function normalizeTeamName(value: string): string {
  return normalizeWhitespace(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');
}

export interface TeamColorPair {
  readonly primary: string;
  readonly secondary: string;
}

const DEFAULT_TEAM_COLOR_PALETTE: readonly TeamColorPair[] = [
  { primary: '#1f4b99', secondary: '#f1c40f' },
  { primary: '#b91c1c', secondary: '#fef3c7' },
  { primary: '#166534', secondary: '#dcfce7' },
  { primary: '#7e22ce', secondary: '#f3e8ff' },
  { primary: '#c2410c', secondary: '#ffedd5' },
  { primary: '#0f766e', secondary: '#ccfbf1' },
  { primary: '#1d4ed8', secondary: '#dbeafe' },
  { primary: '#a21caf', secondary: '#fae8ff' },
  { primary: '#0369a1', secondary: '#e0f2fe' },
  { primary: '#4d7c0f', secondary: '#ecfccb' },
  { primary: '#be123c', secondary: '#ffe4e6' },
  { primary: '#4338ca', secondary: '#e0e7ff' },
];

export function getDefaultTeamColorPair(existingTeams: readonly Team[], offset = 0): TeamColorPair {
  const usedPrimaries = new Set(existingTeams.map((team) => team.primaryColor.toLocaleUpperCase()));
  for (let step = 0; step < DEFAULT_TEAM_COLOR_PALETTE.length; step += 1) {
    const paletteIndex = (offset + step) % DEFAULT_TEAM_COLOR_PALETTE.length;
    const colors = DEFAULT_TEAM_COLOR_PALETTE[paletteIndex];
    if (!usedPrimaries.has(colors.primary.toLocaleUpperCase())) {
      return colors;
    }
  }
  return DEFAULT_TEAM_COLOR_PALETTE[
    (existingTeams.length + offset) % DEFAULT_TEAM_COLOR_PALETTE.length
  ];
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

function relativeLuminance(rgb: readonly [number, number, number]): number {
  const convert = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const [red, green, blue] = rgb;
  return 0.2126 * convert(red) + 0.7152 * convert(green) + 0.0722 * convert(blue);
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
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const contrast =
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05);

  return distance < 72 || contrast < 2.5;
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
