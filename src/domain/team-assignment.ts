import { Player, RosterLimits, Team } from './model';

export interface AssignmentResult {
  readonly captainClearedTeamIds: readonly string[];
  readonly playerIds: readonly string[];
}

export function analyzePlayerAssignments(
  players: readonly Player[],
  playerIds: readonly string[],
  destinationTeamId: string | null,
  teams: readonly Team[],
): AssignmentResult {
  const selected = new Set(playerIds);
  const captainClearedTeamIds = teams
    .filter(
      (team) =>
        team.captainId !== null &&
        selected.has(team.captainId) &&
        players.find((player) => player.id === team.captainId)?.teamId !== destinationTeamId,
    )
    .map((team) => team.id);

  return { captainClearedTeamIds, playerIds: [...playerIds] };
}

export function getTeamRosterStatus(
  players: readonly Player[],
  teamId: string,
  limits: RosterLimits,
): { readonly count: number; readonly state: 'BELOW_MINIMUM' | 'ABOVE_MAXIMUM' | 'OK' } {
  const count = players.filter((player) => player.teamId === teamId).length;
  if (count < limits.min) {
    return { count, state: 'BELOW_MINIMUM' };
  }
  if (limits.max !== null && count > limits.max) {
    return { count, state: 'ABOVE_MAXIMUM' };
  }
  return { count, state: 'OK' };
}
