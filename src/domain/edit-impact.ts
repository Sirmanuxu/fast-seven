import {
  AnalyzeEditImpact,
  CreateRng,
  Draw,
  EditImpact,
  Id,
  Match,
  MatchRef,
  TournamentSnapshot,
} from './model';
import { createSeededRng } from './rng';
import { computeStandings } from './standings';
import { resolveMatchesWithDraws } from './resolve-matches';

export interface EditImpactAnalysis {
  readonly impact: EditImpact;
  readonly draws: readonly Draw[];
}

function createImpactRng(snapshot: TournamentSnapshot): CreateRng {
  const fingerprint = JSON.stringify({
    tournamentId: snapshot.tournament.id,
    updatedAt: snapshot.tournament.updatedAt,
    matches: snapshot.matches.map(({ id, status, result }) => [id, status, result]),
    events: snapshot.events.map(({ id, matchId, teamId, type, playerId }) => [
      id,
      matchId,
      teamId,
      type,
      playerId,
    ]),
    draws: snapshot.draws.map(({ id, seed, payload }) => [id, seed, payload]),
  });
  return (seed) => createSeededRng(`${fingerprint}-${seed}`);
}

interface GroupStandings {
  readonly positionByTeam: ReadonlyMap<Id, number>;
  readonly drawSets: readonly string[];
}

function groupStandings(
  snapshot: TournamentSnapshot,
  createRng: CreateRng,
  seed: string,
): ReadonlyMap<Id, GroupStandings> {
  return new Map(
    snapshot.groups.map((group) => {
      const standings = computeStandings({
        teamIds: group.teamIds,
        matches: snapshot.matches.filter(
          (match) => match.stageId === group.stageId && match.groupId === group.id,
        ),
        events: snapshot.events,
        teams: snapshot.teams.filter((team) => group.teamIds.includes(team.id)),
        rules: snapshot.tournament.rules,
        draws: snapshot.draws,
        rng: createRng(`${seed}-${group.id}`),
      });
      return [
        group.id,
        {
          positionByTeam: new Map(standings.rows.map((row) => [row.teamId, row.position] as const)),
          drawSets: [
            ...new Set(
              standings.rows
                .filter((row) => row.tiebreak?.criterion === 'DRAW')
                .map((row) => [...(row.tiebreak?.comparedTeamIds ?? [])].sort().join('\0')),
            ),
          ].sort(),
        },
      ];
    }),
  );
}

function changedDrawPositions(before: GroupStandings, after: GroupStandings): ReadonlySet<number> {
  const beforeSets = new Set(before.drawSets);
  const afterSets = new Set(after.drawSets);
  const changedTeams = [...new Set([...beforeSets, ...afterSets])]
    .filter((set) => beforeSets.has(set) !== afterSets.has(set))
    .flatMap((set) => set.split('\0'));
  return new Set(
    changedTeams.flatMap((teamId) =>
      [before.positionByTeam.get(teamId), after.positionByTeam.get(teamId)].filter(
        (position): position is number => position !== undefined,
      ),
    ),
  );
}

function referencesChangedDrawGroup(
  ref: MatchRef,
  groupId: Id,
  positions: ReadonlySet<number>,
): boolean {
  if (ref.kind === 'GROUP_POSITION') {
    return ref.groupId === groupId && positions.has(ref.position);
  }
  return ref.kind === 'LEVEL_POSITION' && positions.has(ref.level);
}

function dependsOnMatch(match: Match, sourceMatchId: Id): boolean {
  return [match.home, match.away].some(
    (ref) => (ref.kind === 'WINNER_OF' || ref.kind === 'LOSER_OF') && ref.matchId === sourceMatchId,
  );
}

export function analyzeEditImpactWithDraws(
  before: TournamentSnapshot,
  after: TournamentSnapshot,
  createRng: CreateRng = createImpactRng(before),
): EditImpactAnalysis {
  const beforeResolution = resolveMatchesWithDraws(before, createRng('cascade-before'));
  const beforeWithDraws = {
    ...before,
    draws: [...before.draws, ...beforeResolution.newDraws],
  };
  const afterWithBaselineDraws = {
    ...after,
    draws: [...after.draws, ...beforeResolution.newDraws],
  };
  const afterResolution = resolveMatchesWithDraws(
    afterWithBaselineDraws,
    createRng('cascade-after'),
  );
  const beforeStandings = groupStandings(beforeWithDraws, createRng, 'cascade-standings-before');
  const afterStandings = groupStandings(
    afterWithBaselineDraws,
    createRng,
    'cascade-standings-after',
  );
  const beforeResolvedById = new Map(
    beforeResolution.matches.map((resolved) => [resolved.matchId, resolved]),
  );
  const afterResolvedById = new Map(
    afterResolution.matches.map((resolved) => [resolved.matchId, resolved]),
  );
  const beforeMatchById = new Map(before.matches.map((match) => [match.id, match]));
  const afterMatchById = new Map(after.matches.map((match) => [match.id, match]));
  const changedDrawPositionsByGroup = new Map<Id, ReadonlySet<number>>();
  const affectedIds = new Set<Id>();

  for (const group of before.groups) {
    const beforeGroup = beforeStandings.get(group.id);
    const afterGroup = afterStandings.get(group.id);
    if (
      beforeGroup &&
      afterGroup &&
      beforeGroup.drawSets.join('|') !== afterGroup.drawSets.join('|')
    ) {
      changedDrawPositionsByGroup.set(group.id, changedDrawPositions(beforeGroup, afterGroup));
    }
  }

  for (const match of after.matches) {
    const beforeResolved = beforeResolvedById.get(match.id);
    const afterResolved = afterResolvedById.get(match.id);
    if (
      beforeResolved &&
      afterResolved &&
      (beforeResolved.homeTeamId !== afterResolved.homeTeamId ||
        beforeResolved.awayTeamId !== afterResolved.awayTeamId)
    ) {
      affectedIds.add(match.id);
    }

    for (const [groupId, positions] of changedDrawPositionsByGroup) {
      if (
        [match.home, match.away].some((ref) => referencesChangedDrawGroup(ref, groupId, positions))
      ) {
        affectedIds.add(match.id);
      }
    }
  }

  const queue = [...affectedIds];
  for (const sourceMatchId of queue) {
    for (const match of after.matches) {
      if (!affectedIds.has(match.id) && dependsOnMatch(match, sourceMatchId)) {
        affectedIds.add(match.id);
        queue.push(match.id);
      }
    }
  }

  const affected = [...affectedIds]
    .map((matchId) => {
      const match = afterMatchById.get(matchId);
      const beforeResolved = beforeResolvedById.get(matchId);
      const afterResolved = afterResolvedById.get(matchId);
      if (!match || !beforeResolved || !afterResolved) return null;
      return {
        matchId,
        status: beforeMatchById.get(matchId)?.status ?? match.status,
        beforeHomeTeamId: beforeResolved.homeTeamId,
        beforeAwayTeamId: beforeResolved.awayTeamId,
        afterHomeTeamId: afterResolved.homeTeamId,
        afterAwayTeamId: afterResolved.awayTeamId,
        losesResult: match.result !== null,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => {
      const leftOrder = afterMatchById.get(left.matchId)?.order ?? 0;
      const rightOrder = afterMatchById.get(right.matchId)?.order ?? 0;
      return leftOrder - rightOrder;
    });

  const draws = new Map<Id, Draw>();
  for (const draw of [...beforeResolution.newDraws, ...afterResolution.newDraws]) {
    draws.set(draw.id, draw);
  }

  return { impact: { affected }, draws: [...draws.values()] };
}

export const analyzeEditImpact: AnalyzeEditImpact = (
  before: TournamentSnapshot,
  after: TournamentSnapshot,
): EditImpact => analyzeEditImpactWithDraws(before, after).impact;
