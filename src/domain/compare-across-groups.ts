import { CompareAcrossGroups, Group, Id, Match, MatchRef, StandingsRow, TournamentRules } from './model';
import { createSeededRng } from './rng';
import { computeStandings } from './standings';

function teamIdFromRef(ref: MatchRef): Id | null {
  return ref.kind === 'TEAM' ? ref.teamId : null;
}

function matchesForGroup(matches: readonly Match[], groupId: Id): readonly Match[] {
  return matches.filter((match) => match.groupId === groupId);
}

function standingsForGroup(
  group: Group,
  matches: readonly Match[],
  events: Parameters<CompareAcrossGroups>[0]['events'],
  rules: TournamentRules,
): readonly StandingsRow[] {
  return computeStandings({
    teamIds: group.teamIds,
    matches,
    events,
    teams: group.teamIds.map((id) => ({
      id,
      name: id,
      primaryColor: '#000000',
      secondaryColor: '#ffffff',
      captainId: null,
      logo: null,
      isSeed: false,
      status: 'ACTIVE',
    })),
    rules,
    draws: [],
    rng: createSeededRng(`compare-across-groups-${group.id}`),
  }).rows;
}

function crossGroupRules(rules: TournamentRules): TournamentRules {
  return {
    ...rules,
    tiebreakers: ['POINT_DIFFERENCE', 'POINTS_FOR', 'TRIES_FOR'],
  };
}

function compareRows(left: StandingsRow, right: StandingsRow): number {
  return (
    right.tablePoints - left.tablePoints ||
    right.pointDifference - left.pointDifference ||
    right.pointsFor - left.pointsFor ||
    right.triesFor - left.triesFor
  );
}

export const compareAcrossGroups: CompareAcrossGroups = ({
  groups,
  matches,
  events,
  rules,
  level,
}) => {
  if (groups.length === 0 || level < 1) {
    return { ranking: [], excludedMatchIds: [], isProvisional: false };
  }

  const fullStandings = groups.map((group) => {
    const groupMatches = matchesForGroup(matches, group.id);
    return {
      group,
      matches: groupMatches,
      rows: standingsForGroup(group, groupMatches, events, rules),
    };
  });
  const smallestGroupSize = Math.min(...groups.map((group) => group.teamIds.length));
  const excludedTeamIds = new Set(
    fullStandings
      .filter(({ group }) => group.teamIds.length > smallestGroupSize)
      .map(({ rows }) => rows[rows.length - 1]?.teamId)
      .filter((teamId): teamId is Id => teamId !== undefined),
  );
  const excludedMatchIds = matches
    .filter((match) => {
      const homeTeamId = teamIdFromRef(match.home);
      const awayTeamId = teamIdFromRef(match.away);
      return (
        match.groupId !== null &&
        (excludedTeamIds.has(homeTeamId ?? '') || excludedTeamIds.has(awayTeamId ?? ''))
      );
    })
    .map((match) => match.id);

  const crossRules = crossGroupRules(rules);
  const candidates = fullStandings.flatMap(({ group, matches: groupMatches, rows }) => {
    const candidate = rows.find((row) => row.position === level);
    if (!candidate) {
      return [];
    }
    const keptMatches = groupMatches.filter((match) => !excludedMatchIds.includes(match.id));
    const comparableRow = standingsForGroup(group, keptMatches, events, crossRules).find(
      (row) => row.teamId === candidate.teamId,
    );
    return comparableRow ? [comparableRow] : [];
  });

  return {
    ranking: [...candidates].sort(compareRows).map((row, index) => ({ ...row, position: index + 1 })),
    excludedMatchIds,
    isProvisional: fullStandings.some(({ matches: groupMatches }) =>
      groupMatches.some((match) => match.status !== 'FINISHED'),
    ),
  };
};
