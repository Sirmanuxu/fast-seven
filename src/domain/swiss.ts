import {
  DomainError,
  Draw,
  GenerateFixture,
  Id,
  Match,
  MatchEvent,
  MatchRef,
  Result,
  Rng,
  Stage,
  Team,
  TournamentRules,
} from './model';
import { computeStandings } from './standings';

const SWISS_STAGE_ID = 'swiss-stage';
const DEFAULT_CREATED_AT = '1970-01-01T00:00:00.000Z';

export interface SwissPairing {
  readonly homeTeamId: Id;
  readonly awayTeamId: Id;
  readonly homeTablePoints: number;
  readonly awayTablePoints: number;
  readonly isRepeat: boolean;
}

export interface SwissRoundPreview {
  readonly stageId: Id;
  readonly round: number;
  readonly pairings: readonly SwissPairing[];
  readonly byeTeamId: Id | null;
  readonly repeatedPairingCount: number;
  readonly requiresConfirmation: boolean;
  readonly newDraws: readonly Draw[];
}

export interface SwissRoundInput {
  readonly stageId: Id;
  readonly round: number;
  readonly teams: readonly Team[];
  readonly matches: readonly Match[];
  readonly events: readonly MatchEvent[];
  readonly rules: TournamentRules;
  readonly draws: readonly Draw[];
  readonly rng: Rng;
}

export interface SwissEditImpact {
  readonly changed: boolean;
  readonly affectedMatchIds: readonly Id[];
  readonly preview: SwissRoundPreview | null;
}

interface PairingCandidate {
  readonly cost: number;
  readonly pairs: readonly (readonly [number, number])[];
}

function error(code: string): Result<never, DomainError> {
  return { ok: false, error: { code, messageKey: `swiss.${code}` } };
}

function teamRef(teamId: Id): MatchRef {
  return { kind: 'TEAM', teamId };
}

function buildMatch(
  stageId: Id,
  round: number,
  index: number,
  homeTeamId: Id,
  awayTeamId: Id | null,
): Match {
  const isBye = awayTeamId === null;
  return {
    id: `${stageId}-round-${round}-match-${index + 1}`,
    stageId,
    groupId: null,
    round,
    order: (round - 1) * 100 + index + 1,
    label: isBye ? 'Libre (bye)' : null,
    home: teamRef(homeTeamId),
    away: isBye ? { kind: 'BYE' } : teamRef(awayTeamId),
    status: isBye ? 'FINISHED' : 'PENDING',
    result: isBye
      ? {
          mode: 'DIRECT',
          homePoints: 0,
          awayPoints: 0,
          definition: 'REGULAR',
          winnerTeamId: null,
        }
      : null,
    startedAt: null,
    finishedAt: null,
    isPhantom: isBye,
    isConditional: false,
  };
}

function initialTeamOrder(teams: readonly Team[], rng: Rng): readonly Id[] {
  const activeTeams = teams.filter((team) => team.status === 'ACTIVE');
  const seeded = activeTeams.filter((team) => team.isSeed).map((team) => team.id);
  const unseeded = activeTeams.filter((team) => !team.isSeed).map((team) => team.id);
  return seeded.length > 0 ? [...seeded, ...rng.shuffle(unseeded)] : rng.shuffle(activeTeams.map((team) => team.id));
}

function makeRoundOneMatches(stageId: Id, teamOrder: readonly Id[]): readonly Match[] {
  const byeTeamId = teamOrder.length % 2 === 1 ? teamOrder[teamOrder.length - 1] : null;
  const playingTeams = byeTeamId ? teamOrder.slice(0, -1) : teamOrder;
  const half = playingTeams.length / 2;
  return [
    ...Array.from({ length: half }, (_, index) =>
      buildMatch(stageId, 1, index, playingTeams[index], playingTeams[index + half]),
    ),
    ...(byeTeamId ? [buildMatch(stageId, 1, half, byeTeamId, null)] : []),
  ];
}

export const generateSwissFixtureContract: GenerateFixture = (input) => {
  if (input.params.format !== 'SWISS') {
    return error('unsupportedFormat');
  }
  if (!Number.isInteger(input.params.rounds) || input.params.rounds < 1) {
    return error('invalidRoundCount');
  }
  const activeTeams = input.teams.filter((team) => team.status === 'ACTIVE');
  if (activeTeams.length < 4) {
    return error('tooFewTeams');
  }
  if (new Set(activeTeams.map((team) => team.id)).size !== activeTeams.length) {
    return error('duplicateTeams');
  }

  const existingDraw = input.draws.find(
    (draw) =>
      draw.payload.kind === 'SWISS_ROUND_ONE' && draw.payload.stageId === SWISS_STAGE_ID,
  );
  const teamOrder =
    existingDraw?.payload.kind === 'SWISS_ROUND_ONE'
      ? existingDraw.payload.teamOrder
      : initialTeamOrder(activeTeams, input.rng);
  if (
    teamOrder.length !== activeTeams.length ||
    new Set(teamOrder).size !== teamOrder.length ||
    teamOrder.some((teamId) => !activeTeams.some((team) => team.id === teamId))
  ) {
    return error('invalidSavedDraw');
  }

  const stage: Stage = {
    id: SWISS_STAGE_ID,
    type: 'SWISS',
    name: 'Suizo',
    order: 1,
    cup: null,
  };
  const draw: Draw = existingDraw ?? {
    id: `${SWISS_STAGE_ID}-round-one-draw`,
    seed: 'swiss-round-one',
    createdAt: DEFAULT_CREATED_AT,
    payload: { kind: 'SWISS_ROUND_ONE', stageId: SWISS_STAGE_ID, teamOrder },
  };

  return {
    ok: true,
    value: {
      stages: [stage],
      groups: [],
      matches: [...makeRoundOneMatches(SWISS_STAGE_ID, teamOrder)],
      newDraws: existingDraw ? [] : [draw],
    },
  };
};

function opponentsByTeam(matches: readonly Match[]): ReadonlyMap<Id, ReadonlySet<Id>> {
  const opponents = new Map<Id, Set<Id>>();
  for (const match of matches) {
    if (match.isPhantom || match.isConditional) continue;
    if (match.home.kind !== 'TEAM' || match.away.kind !== 'TEAM') continue;
    const home = opponents.get(match.home.teamId) ?? new Set<Id>();
    const away = opponents.get(match.away.teamId) ?? new Set<Id>();
    home.add(match.away.teamId);
    away.add(match.home.teamId);
    opponents.set(match.home.teamId, home);
    opponents.set(match.away.teamId, away);
  }
  return opponents;
}

function pairingCost(
  firstIndex: number,
  secondIndex: number,
  rankedTeamIds: readonly Id[],
  pointsByTeam: ReadonlyMap<Id, number>,
  opponents: ReadonlyMap<Id, ReadonlySet<Id>>,
  bracketByTeam: ReadonlyMap<
    Id,
    { readonly bracketId: number; readonly index: number; readonly size: number }
  >,
): number {
  const firstId = rankedTeamIds[firstIndex];
  const secondId = rankedTeamIds[secondIndex];
  const repeat = opponents.get(firstId)?.has(secondId) ?? false;
  const pointsGap = Math.abs((pointsByTeam.get(firstId) ?? 0) - (pointsByTeam.get(secondId) ?? 0));
  const firstBracket = bracketByTeam.get(firstId);
  const secondBracket = bracketByTeam.get(secondId);
  const bracketPenalty =
    firstBracket && secondBracket && firstBracket.bracketId !== secondBracket.bracketId
      ? 0
      : firstBracket && secondBracket && firstBracket.bracketId === secondBracket.bracketId
        ? Math.abs(
            secondBracket.index -
              firstBracket.index -
              Math.ceil(firstBracket.size / 2),
          )
        : 0;
  return (repeat ? 1_000_000_000_000 : 0) + pointsGap * 1_000_000 + bracketPenalty;
}

function findBestPairing(
  rankedTeamIds: readonly Id[],
  pointsByTeam: ReadonlyMap<Id, number>,
  opponents: ReadonlyMap<Id, ReadonlySet<Id>>,
  bracketByTeam: ReadonlyMap<
    Id,
    { readonly bracketId: number; readonly index: number; readonly size: number }
  >,
): PairingCandidate | null {
  const memo = new Map<bigint, PairingCandidate | null>();

  const solve = (remaining: bigint): PairingCandidate | null => {
    if (remaining === 0n) return { cost: 0, pairs: [] };
    const cached = memo.get(remaining);
    if (cached !== undefined) return cached;

    let firstIndex = 0;
    while ((remaining & (1n << BigInt(firstIndex))) === 0n) firstIndex += 1;
    const withoutFirst = remaining & ~(1n << BigInt(firstIndex));
    let best: PairingCandidate | null = null;
    for (let secondIndex = firstIndex + 1; secondIndex < rankedTeamIds.length; secondIndex += 1) {
      const secondBit = 1n << BigInt(secondIndex);
      if ((withoutFirst & secondBit) === 0n) continue;
      const tail = solve(withoutFirst & ~secondBit);
      if (!tail) continue;
      const candidate: PairingCandidate = {
        cost:
          pairingCost(firstIndex, secondIndex, rankedTeamIds, pointsByTeam, opponents, bracketByTeam) +
          tail.cost,
        pairs: [[firstIndex, secondIndex], ...tail.pairs],
      };
      if (best === null || candidate.cost < best.cost) best = candidate;
    }
    memo.set(remaining, best);
    return best;
  };

  return solve((1n << BigInt(rankedTeamIds.length)) - 1n);
}

export function previewSwissRound(input: SwissRoundInput): Result<SwissRoundPreview, DomainError> {
  if (!Number.isInteger(input.round) || input.round < 2) {
    return error('invalidRound');
  }
  const stageMatches = input.matches.filter((match) => match.stageId === input.stageId);
  const lastRound = stageMatches.reduce((maximum, match) => Math.max(maximum, match.round), 0);
  if (input.round !== lastRound + 1 || lastRound === 0) {
    return error('roundOutOfSequence');
  }
  if (
    stageMatches.some(
      (match) => match.round === lastRound && (match.status !== 'FINISHED' || match.result === null),
    )
  ) {
    return error('previousRoundIncomplete');
  }

  const activeTeams = input.teams.filter((team) => team.status === 'ACTIVE');
  if (activeTeams.length < 4) return error('tooFewTeams');
  const standingsResult = computeStandings({
    teamIds: activeTeams.map((team) => team.id),
    teams: activeTeams,
    matches: stageMatches,
    events: input.events,
    rules: input.rules,
    draws: input.draws,
    rng: input.rng,
  });
  const rankedRows = standingsResult.rows;
  const byeTeamIds = new Set(
    stageMatches
      .filter(
        (match) =>
          match.status === 'FINISHED' &&
          match.result !== null &&
          ((match.home.kind === 'BYE' && match.away.kind === 'TEAM') ||
            (match.away.kind === 'BYE' && match.home.kind === 'TEAM')),
      )
      .map((match) => (match.home.kind === 'TEAM' ? match.home.teamId : match.away.kind === 'TEAM' ? match.away.teamId : '')),
  );
  const byeRow =
    activeTeams.length % 2 === 1
      ? [...rankedRows].reverse().find((row) => !byeTeamIds.has(row.teamId)) ??
        rankedRows[rankedRows.length - 1]
      : undefined;
  const pairingRows = rankedRows.filter((row) => row.teamId !== byeRow?.teamId);
  const rankedTeamIds = pairingRows.map((row) => row.teamId);
  const pointsByTeam = new Map(pairingRows.map((row) => [row.teamId, row.tablePoints]));
  const opponents = opponentsByTeam(stageMatches);
  const byPoints = new Map<number, Id[]>();
  for (const row of pairingRows) {
    const bucket = byPoints.get(row.tablePoints) ?? [];
    bucket.push(row.teamId);
    byPoints.set(row.tablePoints, bucket);
  }
  const bracketByTeam = new Map<
    Id,
    { readonly bracketId: number; readonly index: number; readonly size: number }
  >();
  let bracketIndex = 0;
  for (const teamIds of byPoints.values()) {
    teamIds.forEach((teamId, index) => {
      bracketByTeam.set(teamId, { bracketId: bracketIndex, index, size: teamIds.length });
    });
    bracketIndex += 1;
  }

  const best = findBestPairing(rankedTeamIds, pointsByTeam, opponents, bracketByTeam);
  if (!best) return error('noValidPairing');
  const pairings = best.pairs.map(([homeIndex, awayIndex]): SwissPairing => {
    const homeTeamId = rankedTeamIds[homeIndex];
    const awayTeamId = rankedTeamIds[awayIndex];
    const homeRow = pairingRows[homeIndex];
    return {
      homeTeamId,
      awayTeamId,
      homeTablePoints: homeRow.tablePoints,
      awayTablePoints: pairingRows[awayIndex].tablePoints,
      isRepeat: opponents.get(homeTeamId)?.has(awayTeamId) ?? false,
    };
  });
  const repeatedPairingCount = pairings.filter((pairing) => pairing.isRepeat).length;
  return {
    ok: true,
    value: {
      stageId: input.stageId,
      round: input.round,
      pairings,
      byeTeamId: byeRow?.teamId ?? null,
      repeatedPairingCount,
      requiresConfirmation: repeatedPairingCount > 0,
      newDraws: standingsResult.newDraws,
    },
  };
}

export function swissPreviewMatches(preview: SwissRoundPreview): readonly Match[] {
  return [
    ...preview.pairings.map((pairing, index) =>
      buildMatch(preview.stageId, preview.round, index, pairing.homeTeamId, pairing.awayTeamId),
    ),
    ...(preview.byeTeamId
      ? [
          buildMatch(
            preview.stageId,
            preview.round,
            preview.pairings.length,
            preview.byeTeamId,
            null,
          ),
        ]
      : []),
  ];
}

function canonicalTeamPair(leftTeamId: Id, rightTeamId: Id): string {
  return [leftTeamId, rightTeamId].sort().join(':');
}

export function analyzeSwissPairingEdit(input: {
  readonly before: import('./model').TournamentSnapshot;
  readonly after: import('./model').TournamentSnapshot;
  readonly sourceMatchId: Id;
  readonly rng: Rng;
}): SwissEditImpact {
  const sourceBefore = input.before.matches.find((match) => match.id === input.sourceMatchId);
  const sourceAfter = input.after.matches.find((match) => match.id === input.sourceMatchId);
  if (!sourceBefore || !sourceAfter) {
    return { changed: false, affectedMatchIds: [], preview: null };
  }
  const stage = input.after.stages.find((candidate) => candidate.id === sourceAfter.stageId);
  if (stage?.type !== 'SWISS') {
    return { changed: false, affectedMatchIds: [], preview: null };
  }

  const stageMatches = input.after.matches.filter(
    (match) => match.stageId === stage.id && match.round <= sourceAfter.round,
  );
  const preview = previewSwissRound({
    stageId: stage.id,
    round: sourceAfter.round + 1,
    teams: input.after.teams,
    matches: stageMatches,
    events: input.after.events,
    rules: input.after.tournament.rules,
    draws: input.after.draws,
    rng: input.rng,
  });
  if (!preview.ok) {
    return { changed: false, affectedMatchIds: [], preview: null };
  }

  const existingNextRound = input.before.matches.filter(
    (match) => match.stageId === stage.id && match.round === sourceAfter.round + 1,
  );
  if (existingNextRound.length === 0) {
    return { changed: false, affectedMatchIds: [], preview: preview.value };
  }

  const existingPairs = new Set(
    existingNextRound
      .filter((match) => match.home.kind === 'TEAM' && match.away.kind === 'TEAM')
      .map((match) =>
        canonicalTeamPair(
          (match.home as Extract<MatchRef, { readonly kind: 'TEAM' }>).teamId,
          (match.away as Extract<MatchRef, { readonly kind: 'TEAM' }>).teamId,
        ),
      )
      .sort(),
  );
  const previewPairs = new Set(
    preview.value.pairings.map((pairing) =>
      canonicalTeamPair(pairing.homeTeamId, pairing.awayTeamId),
    ),
  );
  const existingBye = existingNextRound.find(
    (match) => match.home.kind === 'TEAM' && match.away.kind === 'BYE',
  );
  const existingByeTeamId =
    existingBye?.home.kind === 'TEAM' ? existingBye.home.teamId : null;
  const changed =
    existingPairs.size !== previewPairs.size ||
    [...existingPairs].some((pair) => !previewPairs.has(pair)) ||
    existingByeTeamId !== preview.value.byeTeamId;
  if (!changed) {
    return { changed: false, affectedMatchIds: [], preview: preview.value };
  }

  const affectedMatchIds = input.after.matches
    .filter((match) => match.stageId === stage.id && match.round >= sourceAfter.round + 1)
    .map((match) => match.id);
  return { changed: true, affectedMatchIds, preview: preview.value };
}

