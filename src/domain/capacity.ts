import { CapacityOption, RosterLimits } from './model';

/**
 * Returns every team count for which all rosters fit within the configured limits.
 * The roster sizes are ordered from largest to smallest for a readable preview.
 */
export function computeCapacity(
  playerCount: number,
  roster: RosterLimits,
): readonly CapacityOption[] {
  if (!Number.isInteger(playerCount) || playerCount <= 0 || !Number.isInteger(roster.min)) {
    return [];
  }

  if (
    roster.min <= 0 ||
    (roster.max !== null && (!Number.isInteger(roster.max) || roster.max < roster.min))
  ) {
    return [];
  }

  const maximumRosterSize = roster.max ?? playerCount;
  const minimumTeamCount = Math.ceil(playerCount / maximumRosterSize);
  const maximumTeamCount = Math.floor(playerCount / roster.min);
  const options: CapacityOption[] = [];

  for (let teamCount = minimumTeamCount; teamCount <= maximumTeamCount; teamCount += 1) {
    const baseSize = Math.floor(playerCount / teamCount);
    const largerRosterCount = playerCount % teamCount;
    const smallerRosterCount = teamCount - largerRosterCount;
    const rosterSizes = [
      ...(largerRosterCount > 0 ? [{ size: baseSize + 1, count: largerRosterCount }] : []),
      ...(smallerRosterCount > 0 ? [{ size: baseSize, count: smallerRosterCount }] : []),
    ];

    options.push({ teamCount, rosterSizes });
  }

  return options;
}
