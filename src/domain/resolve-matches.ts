import {
  CompareAcrossGroups,
  Draw,
  Group,
  Id,
  Match,
  MatchRef,
  ResolveMatches,
  ResolvedMatch,
  StandingsRow,
  TournamentSnapshot,
} from './model';
import { compareAcrossGroups } from './compare-across-groups';
import { computeStandings } from './standings';

export interface ResolveMatchesResult {
  readonly matches: readonly ResolvedMatch[];
  readonly newDraws: readonly Draw[];
}

function isGroupComplete(group: Group, snapshot: TournamentSnapshot): boolean {
  const matches = snapshot.matches.filter(
    (match) =>
      match.stageId === group.stageId &&
      match.groupId === group.id &&
      !match.isPhantom &&
      !match.isConditional,
  );
  return (
    matches.length > 0 &&
    matches.every((match) => match.status === 'FINISHED' && match.result !== null)
  );
}

function describeReference(ref: MatchRef, snapshot: TournamentSnapshot): string {
  switch (ref.kind) {
    case 'TEAM':
      return snapshot.teams.find((team) => team.id === ref.teamId)?.name ?? ref.teamId;
    case 'GROUP_POSITION': {
      const group = snapshot.groups.find((entry) => entry.id === ref.groupId);
      return `${ref.position}° Grupo ${group?.name ?? ref.groupId}`;
    }
    case 'LEVEL_POSITION':
      return `${ref.position}° del nivel ${ref.level}`;
    case 'WINNER_OF':
    case 'LOSER_OF': {
      const match = snapshot.matches.find((entry) => entry.id === ref.matchId);
      const description = ref.kind === 'WINNER_OF' ? 'Ganador' : 'Perdedor';
      return `${description} partido #${match?.order ?? ref.matchId}`;
    }
    case 'BYE':
      return 'Libre';
  }
}

export function resolveMatchesWithDraws(
  snapshot: TournamentSnapshot,
  rng: Parameters<ResolveMatches>[1],
): ResolveMatchesResult {
  const teamsById = new Map(snapshot.teams.map((team) => [team.id, team]));
  const matchesById = new Map(snapshot.matches.map((match) => [match.id, match]));
  const groupsById = new Map(snapshot.groups.map((group) => [group.id, group]));
  const standingsByGroup = new Map<Id, readonly StandingsRow[]>();
  const newDrawsById = new Map<Id, Draw>();
  const levelRankings = new Map<number, ReturnType<CompareAcrossGroups> | null>();

  const groupStandings = (group: Group): readonly StandingsRow[] => {
    const cached = standingsByGroup.get(group.id);
    if (cached) {
      return cached;
    }
    const groupMatches = snapshot.matches.filter(
      (match) => match.stageId === group.stageId && match.groupId === group.id,
    );
    const standings = computeStandings({
      teamIds: group.teamIds,
      matches: groupMatches,
      events: snapshot.events,
      teams: snapshot.teams.filter((team) => group.teamIds.includes(team.id)),
      rules: snapshot.tournament.rules,
      draws: snapshot.draws,
      rng,
    });
    standingsByGroup.set(group.id, standings.rows);
    for (const draw of standings.newDraws) {
      newDrawsById.set(draw.id, draw);
    }
    return standings.rows;
  };

  const crossGroupRanking = (level: number): readonly StandingsRow[] | null => {
    const cached = levelRankings.get(level);
    if (cached !== undefined) {
      return cached?.ranking ?? null;
    }
    const relevantGroups = snapshot.groups.filter((group) => group.teamIds.length >= level);
    if (
      relevantGroups.length === 0 ||
      relevantGroups.some((group) => !isGroupComplete(group, snapshot))
    ) {
      levelRankings.set(level, null);
      return null;
    }
    const ranking = compareAcrossGroups({
      groups: snapshot.groups,
      matches: snapshot.matches,
      events: snapshot.events,
      rules: snapshot.tournament.rules,
      level,
    });
    levelRankings.set(level, ranking);
    return ranking.ranking;
  };

  const resolveFinishedWinner = (
    match: Match,
    ancestors: ReadonlySet<Id>,
  ): { readonly winner: Id; readonly loser: Id | null } | null => {
    if (ancestors.has(match.id)) {
      return null;
    }
    const nextAncestors = new Set(ancestors).add(match.id);
    const homeTeamId = resolveReference(match.home, nextAncestors);
    const awayTeamId = resolveReference(match.away, nextAncestors);
    if (match.home.kind === 'BYE' && awayTeamId !== null) {
      return { winner: awayTeamId, loser: null };
    }
    if (match.away.kind === 'BYE' && homeTeamId !== null) {
      return { winner: homeTeamId, loser: null };
    }
    if (match.status !== 'FINISHED' || match.result === null) {
      return null;
    }
    const winnerTeamId =
      match.result.winnerTeamId ??
      (match.result.homePoints === match.result.awayPoints
        ? null
        : match.result.homePoints > match.result.awayPoints
          ? homeTeamId
          : awayTeamId);
    if (
      winnerTeamId === null ||
      (winnerTeamId !== homeTeamId && winnerTeamId !== awayTeamId) ||
      homeTeamId === null ||
      awayTeamId === null
    ) {
      return null;
    }
    return {
      winner: winnerTeamId,
      loser: winnerTeamId === homeTeamId ? awayTeamId : homeTeamId,
    };
  };

  const resolveReference = (ref: MatchRef, ancestors: ReadonlySet<Id>): Id | null => {
    switch (ref.kind) {
      case 'TEAM':
        return teamsById.has(ref.teamId) ? ref.teamId : null;
      case 'BYE':
        return null;
      case 'GROUP_POSITION': {
        const group = groupsById.get(ref.groupId);
        if (
          !group ||
          !Number.isInteger(ref.position) ||
          ref.position < 1 ||
          !isGroupComplete(group, snapshot)
        ) {
          return null;
        }
        return groupStandings(group)[ref.position - 1]?.teamId ?? null;
      }
      case 'LEVEL_POSITION': {
        if (
          !Number.isInteger(ref.level) ||
          ref.level < 1 ||
          !Number.isInteger(ref.position) ||
          ref.position < 1
        ) {
          return null;
        }
        return crossGroupRanking(ref.level)?.[ref.position - 1]?.teamId ?? null;
      }
      case 'WINNER_OF':
      case 'LOSER_OF': {
        const source = matchesById.get(ref.matchId);
        if (!source || ancestors.has(source.id)) {
          return null;
        }
        const outcome = resolveFinishedWinner(source, ancestors);
        if (!outcome) {
          return null;
        }
        if (ref.kind === 'LOSER_OF' && outcome.loser === null) {
          return null;
        }
        return ref.kind === 'WINNER_OF' ? outcome.winner : outcome.loser;
      }
    }
  };

  const resolvedMatches = snapshot.matches.map((match): ResolvedMatch => {
    const ancestors = new Set([match.id]);
    const homeTeamId = resolveReference(match.home, ancestors);
    const awayTeamId = resolveReference(match.away, ancestors);
    const homeLabel =
      homeTeamId === null
        ? describeReference(match.home, snapshot)
        : (teamsById.get(homeTeamId)?.name ?? homeTeamId);
    const awayLabel =
      awayTeamId === null
        ? describeReference(match.away, snapshot)
        : (teamsById.get(awayTeamId)?.name ?? awayTeamId);
    let isPlayable =
      homeTeamId !== null &&
      awayTeamId !== null &&
      match.home.kind !== 'BYE' &&
      match.away.kind !== 'BYE' &&
      !match.isPhantom &&
      !match.isConditional;
    if (match.isConditional) {
      const sourceRef =
        match.home.kind === 'WINNER_OF'
          ? match.home.matchId
          : match.away.kind === 'WINNER_OF'
            ? match.away.matchId
            : match.away.kind === 'LOSER_OF'
              ? match.away.matchId
              : null;
      const source = sourceRef ? matchesById.get(sourceRef) : undefined;
      if (source) {
        const outcome = resolveFinishedWinner(source, new Set([match.id]));
        isPlayable =
          outcome !== null &&
          outcome.winner === awayTeamId &&
          homeTeamId !== null &&
          awayTeamId !== null &&
          !match.isPhantom;
      } else {
        isPlayable = false;
      }
    }
    return {
      matchId: match.id,
      homeTeamId,
      awayTeamId,
      homeLabel,
      awayLabel,
      isPlayable,
    };
  });

  return { matches: resolvedMatches, newDraws: [...newDrawsById.values()] };
}

export const resolveMatches: ResolveMatches = (snapshot, rng) =>
  resolveMatchesWithDraws(snapshot, rng).matches;
