import {
  DomainError,
  FormatParams,
  GenerateFixture,
  Group,
  Id,
  Match,
  MatchRef,
  Result,
  Stage,
} from './model';

export interface RoundRobinMatchInput {
  readonly teamIds: readonly Id[];
  readonly rounds: 1 | 2;
  readonly stageId: string;
  readonly groupId?: Id | null;
  readonly matchIdPrefix?: string;
}

export interface RoundRobinFixtureInput {
  readonly teamIds: readonly Id[];
  readonly rounds: 1 | 2;
  readonly stageId: string;
  readonly stageName?: string;
  readonly groupId?: Id | null;
  readonly matchIdPrefix?: string;
}

export interface RoundRobinFixture {
  readonly stage: Stage;
  readonly group: Group | null;
  readonly matches: readonly Match[];
}

function error(code: string, params?: Readonly<Record<string, string | number>>): Result<never, DomainError> {
  return { ok: false, error: { code, messageKey: `roundRobin.${code}`, params } };
}

function teamRef(teamId: Id): MatchRef {
  return { kind: 'TEAM', teamId };
}

function oneLapPairs(teamIds: readonly Id[]): readonly (readonly (Id | null)[])[] {
  let rotation: (Id | null)[] = teamIds.length % 2 === 0 ? [...teamIds] : [...teamIds, null];
  const roundCount = rotation.length - 1;
  const rounds: (readonly (Id | null)[])[] = [];

  for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
    const pairs: (Id | null)[] = [];
    for (let pairIndex = 0; pairIndex < rotation.length / 2; pairIndex += 1) {
      pairs.push(rotation[pairIndex], rotation[rotation.length - 1 - pairIndex]);
    }
    rounds.push(pairs);
    rotation = [
      rotation[0],
      rotation[rotation.length - 1],
      ...rotation.slice(1, -1),
    ];
  }

  return rounds;
}

function orientPairs(
  rounds: readonly (readonly (Id | null)[])[],
  teamIds: readonly Id[],
): readonly (readonly (readonly [Id, Id])[])[] | null {
  const roundPairs: [Id, Id][][] = rounds.map((round) => {
    const pairs: [Id, Id][] = [];
    for (let index = 0; index < round.length; index += 2) {
      const first = round[index];
      const second = round[index + 1];
      if (first !== null && second !== null) {
        pairs.push([first, second]);
      }
    }
    return pairs;
  });
  const teamIndex = new Map(teamIds.map((teamId, index) => [teamId, index]));
  const exactPatterns: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
    2: [[0, 1]],
    3: [[1, 2], [2, 0], [0, 1]],
    4: [[0, 3], [1, 2], [0, 2], [3, 1], [1, 0], [2, 3]],
    5: [
      [1, 4], [2, 3], [0, 4], [1, 2], [3, 0], [4, 2], [2, 0], [3, 1], [0, 1], [4, 3],
    ],
    6: [
      [0, 5], [1, 4], [2, 3], [0, 4], [5, 3], [1, 2], [0, 3], [4, 2], [5, 1],
      [2, 0], [3, 1], [4, 5], [1, 0], [2, 5], [3, 4],
    ],
    7: [
      [1, 6], [2, 5], [3, 4], [0, 6], [1, 4], [2, 3], [0, 5], [6, 4], [1, 2],
      [4, 0], [5, 3], [6, 2], [3, 0], [4, 2], [5, 1], [2, 0], [3, 1], [5, 6],
      [0, 1], [6, 3], [4, 5],
    ],
    8: [
      [0, 7], [1, 6], [2, 5], [3, 4], [0, 6], [7, 5], [1, 4], [2, 3], [0, 5],
      [6, 4], [7, 3], [1, 2], [0, 4], [5, 3], [6, 2], [7, 1], [3, 0], [4, 2],
      [5, 1], [6, 7], [2, 0], [3, 1], [4, 7], [5, 6], [1, 0], [2, 7], [3, 6],
      [4, 5],
    ],
  };
  const exactPattern = exactPatterns[teamIds.length];
  if (exactPattern) {
    const orientation = exactPattern.map(([homeIndex, awayIndex]) =>
      [teamIds[homeIndex], teamIds[awayIndex]] as [Id, Id],
    );
    const byRound: [Id, Id][][] = roundPairs.map(() => []);
    let matchIndex = 0;
    for (let roundIndex = 0; roundIndex < roundPairs.length; roundIndex += 1) {
      for (const pair of roundPairs[roundIndex]) {
        void pair;
        byRound[roundIndex].push(orientation[matchIndex]);
        matchIndex += 1;
      }
    }
    return byRound;
  }

  const floorTarget =
    teamIds.length % 2 === 0 ? teamIds.length / 2 - 1 : (teamIds.length - 1) / 2;
  const ceilTarget = teamIds.length % 2 === 0 ? floorTarget + 1 : floorTarget;
  const matches = roundPairs.flat();
  const cost = (counts: readonly number[]): readonly [number, number] => {
    const maxDifference = Math.max(
      ...counts.map((count) => Math.abs(count - floorTarget)),
    );
    const sumSquares = counts.reduce(
      (total, count) => total + (count - floorTarget) * (count - floorTarget),
      0,
    );
    return [maxDifference, sumSquares];
  };
  let found: [Id, Id][] | null = null;

  for (let start = 0; start < matches.length && found === null; start += 1) {
    const orientation = matches.map(([first, second], matchIndex) =>
      (matchIndex + start) % 2 === 0 ? [first, second] : [second, first],
    ) as [Id, Id][];

    for (let iteration = 0; iteration < matches.length * 2; iteration += 1) {
      const counts = teamIds.map(() => 0);
      for (const [home] of orientation) {
        const homeIndex = teamIndex.get(home);
        if (homeIndex !== undefined) {
          counts[homeIndex] += 1;
        }
      }
      const currentCost = cost(counts);
      if (
        teamIds.length % 2 === 1
          ? counts.every((count) => count === floorTarget)
          : counts.filter((count) => count === ceilTarget).length === teamIds.length / 2 &&
            counts.every((count) => count === floorTarget || count === ceilTarget)
      ) {
        found = orientation;
        break;
      }

      let bestMatchIndex = -1;
      let bestCost = currentCost;
      for (let matchIndex = 0; matchIndex < orientation.length; matchIndex += 1) {
        const [first, second] = orientation[matchIndex];
        const candidate = [...orientation];
        candidate[matchIndex] = [second, first];
        const candidateCounts = teamIds.map(() => 0);
        for (const [home] of candidate) {
          const homeIndex = teamIndex.get(home);
          if (homeIndex !== undefined) {
            candidateCounts[homeIndex] += 1;
          }
        }
        const candidateCost = cost(candidateCounts);
        if (
          candidateCost[0] < bestCost[0] ||
          (candidateCost[0] === bestCost[0] && candidateCost[1] < bestCost[1])
        ) {
          bestMatchIndex = matchIndex;
          bestCost = candidateCost;
        }
      }
      if (bestMatchIndex < 0) {
        break;
      }
      const [first, second] = orientation[bestMatchIndex];
      orientation[bestMatchIndex] = [second, first];
    }
  }

  if (found === null) {
    return null;
  }

  const byRound: [Id, Id][][] = roundPairs.map(() => []);
  let matchIndex = 0;
  for (let roundIndex = 0; roundIndex < roundPairs.length; roundIndex += 1) {
    for (const pair of roundPairs[roundIndex]) {
      void pair;
      byRound[roundIndex].push(found[matchIndex]);
      matchIndex += 1;
    }
  }
  return byRound;
}

export function generateRoundRobinMatches(
  input: RoundRobinMatchInput,
): Result<readonly Match[], DomainError>;
export function generateRoundRobinMatches(
  teamIds: readonly Id[],
  rounds?: 1 | 2,
  stageId?: string,
  groupId?: Id | null,
): Result<readonly Match[], DomainError>;
export function generateRoundRobinMatches(
  inputOrTeamIds: RoundRobinMatchInput | readonly Id[],
  roundsInput: 1 | 2 = 1,
  stageIdInput = 'round-robin-stage',
  groupIdInput: Id | null = null,
): Result<readonly Match[], DomainError> {
  const input: RoundRobinMatchInput =
    'teamIds' in inputOrTeamIds
      ? inputOrTeamIds
      : {
          teamIds: inputOrTeamIds as readonly Id[],
          rounds: roundsInput,
          stageId: stageIdInput,
          groupId: groupIdInput,
        };

  if (!Number.isInteger(input.teamIds.length) || input.teamIds.length < 2) {
    return error('tooFewTeams', { minimum: 2 });
  }
  if (new Set(input.teamIds).size !== input.teamIds.length) {
    return error('duplicateTeams');
  }
  if (input.rounds !== 1 && input.rounds !== 2) {
    return error('invalidRounds');
  }

  const rounds = oneLapPairs(input.teamIds);
  const oriented = orientPairs(rounds, input.teamIds);
  if (oriented === null) {
    return error('homeAwayBalance');
  }

  const matches: Match[] = [];
  let order = 1;
  const firstLapMatchRefs: { readonly round: number; readonly home: MatchRef; readonly away: MatchRef }[] =
    [];

  for (let roundIndex = 0; roundIndex < rounds.length; roundIndex += 1) {
    for (const [homeTeamId, awayTeamId] of oriented[roundIndex]) {
      const matchId =
        `${input.matchIdPrefix ?? input.stageId}-lap-1-round-${roundIndex + 1}-match-${order}`;
      const home = teamRef(homeTeamId);
      const away = teamRef(awayTeamId);
      matches.push({
        id: matchId,
        stageId: input.stageId,
        groupId: input.groupId ?? null,
        round: roundIndex + 1,
        order,
        label: null,
        home,
        away,
        status: 'PENDING',
        result: null,
        startedAt: null,
        finishedAt: null,
        isPhantom: false,
        isConditional: false,
      });
      firstLapMatchRefs.push({ round: roundIndex + 1, home, away });
      order += 1;
    }
  }

  if (input.rounds === 2) {
    for (let roundIndex = 0; roundIndex < rounds.length; roundIndex += 1) {
      const refs = firstLapMatchRefs.filter((entry) => entry.round === roundIndex + 1);
      for (const ref of refs) {
        const matchId =
          `${input.matchIdPrefix ?? input.stageId}-lap-2-round-${roundIndex + 1}-match-${order}`;
        matches.push({
          id: matchId,
          stageId: input.stageId,
          groupId: input.groupId ?? null,
          round: rounds.length + roundIndex + 1,
          order,
          label: null,
          home: ref.away,
          away: ref.home,
          status: 'PENDING',
          result: null,
          startedAt: null,
          finishedAt: null,
          isPhantom: false,
          isConditional: false,
        });
        order += 1;
      }
    }
  }

  return { ok: true, value: matches };
}

export function generateRoundRobinFixture(
  input: RoundRobinFixtureInput,
): Result<RoundRobinFixture, DomainError> {
  const stage: Stage = {
    id: input.stageId,
    type: 'LEAGUE',
    name: input.stageName ?? 'Todos contra todos',
    order: 1,
    cup: null,
  };
  const group: Group | null =
    input.groupId === null || input.groupId === undefined
      ? null
      : { id: input.groupId, stageId: input.stageId, name: 'A', teamIds: input.teamIds };
  const matches = generateRoundRobinMatches({
    teamIds: input.teamIds,
    rounds: input.rounds,
    stageId: input.stageId,
    groupId: input.groupId ?? null,
    matchIdPrefix: input.matchIdPrefix,
  });
  if (!matches.ok) {
    return matches;
  }
  return { ok: true, value: { stage, group, matches: matches.value } };
}

export const generateFixture: GenerateFixture = (input) => {
  if (input.params.format !== 'ROUND_ROBIN') {
    return error('unsupportedFormat');
  }
  const params: Extract<FormatParams, { readonly format: 'ROUND_ROBIN' }> = input.params;
  const fixture = generateRoundRobinFixture({
    teamIds: input.teams.map((team) => team.id),
    rounds: params.rounds,
    stageId: 'round-robin-stage',
  });
  if (!fixture.ok) {
    return fixture;
  }
  return {
    ok: true,
    value: {
      stages: [fixture.value.stage],
      groups: fixture.value.group === null ? [] : [fixture.value.group],
      matches: [...fixture.value.matches],
      newDraws: [],
    },
  };
};
