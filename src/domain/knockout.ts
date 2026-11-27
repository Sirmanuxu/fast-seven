import {
  DomainError,
  Draw,
  FormatParams,
  GenerateFixture,
  Id,
  Match,
  MatchRef,
  Result,
  Rng,
  Stage,
  Team,
} from './model';

export interface KnockoutMatchesInput {
  readonly teamIds: readonly Id[];
  readonly stageId?: string;
  readonly stageName?: string;
  readonly thirdPlaceMatch?: boolean;
  readonly matchIdPrefix?: string;
  readonly rng?: Rng;
  readonly seededTeamIds?: readonly Id[];
  readonly teamOrder?: readonly Id[];
  readonly slotRefs?: readonly MatchRef[];
}

export interface KnockoutFixtureInput extends KnockoutMatchesInput {
  readonly teams?: readonly Team[];
  readonly drawId?: string;
  readonly seed?: string;
  readonly createdAt?: string;
}

export interface KnockoutFixture {
  readonly stage: Stage;
  readonly matches: readonly Match[];
  readonly draw: Draw | null;
  readonly teamOrder: readonly Id[];
  readonly bracketSize: number;
  readonly byeCount: number;
}

function error(
  code: string,
  params?: Readonly<Record<string, string | number>>,
): Result<never, DomainError> {
  return { ok: false, error: { code, messageKey: `knockout.${code}`, params } };
}

export function getKnockoutBracketSize(teamCount: number): number {
  if (!Number.isInteger(teamCount) || teamCount < 1) {
    return 0;
  }
  return 2 ** Math.ceil(Math.log2(teamCount));
}

export function getStandardSeedOrder(bracketSize: number): readonly number[] {
  if (
    !Number.isInteger(bracketSize) ||
    bracketSize < 2 ||
    (bracketSize & (bracketSize - 1)) !== 0
  ) {
    return [];
  }
  let order: number[] = [1, 2];
  for (let size = 4; size <= bracketSize; size *= 2) {
    order = order.flatMap((seed) => [seed, size + 1 - seed]);
  }
  return order;
}

function teamRef(teamId: Id): MatchRef {
  return { kind: 'TEAM', teamId };
}

function winnerRef(matchId: Id): MatchRef {
  return { kind: 'WINNER_OF', matchId };
}

function loserRef(matchId: Id): MatchRef {
  return { kind: 'LOSER_OF', matchId };
}

function roundLabel(round: number, roundCount: number): string | null {
  const roundsRemaining = roundCount - round + 1;
  if (roundsRemaining === 1) {
    return 'Final';
  }
  if (roundsRemaining === 2) {
    return 'Semifinal';
  }
  if (roundsRemaining === 3) {
    return 'Cuartos de final';
  }
  if (roundsRemaining === 4) {
    return 'Octavos de final';
  }
  return null;
}

function buildTeamOrder(
  teamIds: readonly Id[],
  rng: Rng | undefined,
  seededTeamIds: readonly Id[] | undefined,
  teamOrder: readonly Id[] | undefined,
): readonly Id[] {
  if (teamOrder) {
    return teamOrder;
  }
  if (seededTeamIds?.length) {
    const seededSet = new Set(seededTeamIds);
    const seeds = teamIds.filter((teamId) => seededSet.has(teamId));
    const unseeded = teamIds.filter((teamId) => !seededSet.has(teamId));
    return [...seeds, ...(rng ? rng.shuffle(unseeded) : unseeded)];
  }
  return rng ? rng.shuffle(teamIds) : [...teamIds];
}

export function generateKnockoutMatches(
  input: KnockoutMatchesInput,
): Result<readonly Match[], DomainError> {
  if (input.teamIds.length < 2 && input.slotRefs === undefined) {
    return error('tooFewTeams', { minimum: 2 });
  }
  if (new Set(input.teamIds).size !== input.teamIds.length) {
    return error('duplicateTeams');
  }

  const bracketSize =
    input.slotRefs === undefined
      ? getKnockoutBracketSize(input.teamIds.length)
      : input.slotRefs.length;
  if (
    !Number.isInteger(bracketSize) ||
    bracketSize < 2 ||
    (bracketSize & (bracketSize - 1)) !== 0
  ) {
    return error('invalidTeamCount');
  }
  if (bracketSize === 0) {
    return error('invalidTeamCount');
  }
  let teamOrder: readonly Id[] = [];
  if (input.slotRefs === undefined) {
    teamOrder = buildTeamOrder(input.teamIds, input.rng, input.seededTeamIds, input.teamOrder);
    if (
      teamOrder.length !== input.teamIds.length ||
      new Set(teamOrder).size !== teamOrder.length ||
      teamOrder.some((teamId) => !input.teamIds.includes(teamId))
    ) {
      return error('invalidTeamOrder');
    }
  }

  const seedOrder = getStandardSeedOrder(bracketSize);
  let slots: MatchRef[] =
    input.slotRefs !== undefined
      ? [...input.slotRefs]
      : seedOrder.map((seed) =>
          seed <= teamOrder.length ? teamRef(teamOrder[seed - 1]) : { kind: 'BYE' },
        );
  const stageId = input.stageId ?? 'knockout-stage';
  const prefix = input.matchIdPrefix ?? stageId;
  const roundCount = Math.log2(bracketSize);
  const matches: Match[] = [];
  let matchOrder = 1;
  const semifinalIds: Id[] = [];

  for (let round = 1; round <= roundCount; round += 1) {
    const nextSlots: MatchRef[] = [];
    for (let pairIndex = 0; pairIndex < slots.length; pairIndex += 2) {
      const home = slots[pairIndex];
      const away = slots[pairIndex + 1] ?? ({ kind: 'BYE' } as MatchRef);
      if (home.kind === 'BYE' && away.kind === 'BYE') {
        nextSlots.push({ kind: 'BYE' });
        continue;
      }
      if (home.kind === 'BYE') {
        nextSlots.push(away);
        continue;
      }
      if (away.kind === 'BYE') {
        nextSlots.push(home);
        continue;
      }

      const matchId = `${prefix}-round-${round}-match-${pairIndex / 2 + 1}`;
      matches.push({
        id: matchId,
        stageId,
        groupId: null,
        round,
        order: matchOrder,
        label: roundLabel(round, roundCount),
        home,
        away,
        status: 'PENDING',
        result: null,
        startedAt: null,
        finishedAt: null,
        isPhantom: false,
        isConditional: false,
      });
      if (round === roundCount - 1) {
        semifinalIds.push(matchId);
      }
      nextSlots.push(winnerRef(matchId));
      matchOrder += 1;
    }
    slots = nextSlots;
  }

  const participantCount =
    input.slotRefs?.filter((slot) => slot.kind !== 'BYE').length ?? input.teamIds.length;
  if (input.thirdPlaceMatch === true && participantCount >= 4 && semifinalIds.length === 2) {
    matches.push({
      id: `${prefix}-third-place`,
      stageId,
      groupId: null,
      round: roundCount,
      order: matchOrder,
      label: 'Tercer puesto',
      home: loserRef(semifinalIds[0]),
      away: loserRef(semifinalIds[1]),
      status: 'PENDING',
      result: null,
      startedAt: null,
      finishedAt: null,
      isPhantom: false,
      isConditional: false,
    });
  }

  return { ok: true, value: matches };
}

export function generateKnockoutFixture(
  input: KnockoutFixtureInput,
): Result<KnockoutFixture, DomainError> {
  if (input.teamIds.length < 2) {
    return error('tooFewTeams', { minimum: 2 });
  }
  if (new Set(input.teamIds).size !== input.teamIds.length) {
    return error('duplicateTeams');
  }

  const stageId = input.stageId ?? 'knockout-stage';
  const seededTeamIds =
    input.seededTeamIds ?? input.teams?.filter((team) => team.isSeed).map((team) => team.id);
  const teamOrder = buildTeamOrder(input.teamIds, input.rng, seededTeamIds, input.teamOrder);
  const draw: Draw = {
    id: input.drawId ?? `${stageId}-draw`,
    seed: input.seed ?? 'knockout',
    createdAt: input.createdAt ?? '1970-01-01T00:00:00.000Z',
    payload: { kind: 'BRACKET', stageId, teamOrder: [...teamOrder] },
  };
  const bracketSize = getKnockoutBracketSize(input.teamIds.length);
  const matches = generateKnockoutMatches({
    ...input,
    stageId,
    teamOrder,
  });
  if (!matches.ok) {
    return matches;
  }

  return {
    ok: true,
    value: {
      stage: {
        id: stageId,
        type: 'KNOCKOUT',
        name: input.stageName ?? 'Eliminación directa',
        order: 1,
        cup: null,
      },
      matches: matches.value,
      draw,
      teamOrder,
      bracketSize,
      byeCount: bracketSize - input.teamIds.length,
    },
  };
}

export const generateKnockoutFixtureContract: GenerateFixture = (input) => {
  if (input.params.format !== 'KNOCKOUT') {
    return error('unsupportedFormat');
  }
  const params: Extract<FormatParams, { readonly format: 'KNOCKOUT' }> = input.params;
  if (input.teams.length < 2) {
    return error('tooFewTeams', { minimum: 2 });
  }
  if (new Set(input.teams.map((team) => team.id)).size !== input.teams.length) {
    return error('duplicateTeams');
  }

  const stageId = 'knockout-stage';
  const existingDraw = input.draws.find(
    (draw) => draw.payload.kind === 'BRACKET' && draw.payload.stageId === stageId,
  );
  let teamOrder: readonly Id[] | undefined;
  if (existingDraw?.payload.kind === 'BRACKET') {
    teamOrder = existingDraw.payload.teamOrder;
  }

  const teamIds = input.teams.map((team) => team.id);
  const fixture = generateKnockoutFixture({
    teams: input.teams,
    teamIds,
    stageId,
    thirdPlaceMatch: params.thirdPlaceMatch,
    rng: input.rng,
    teamOrder,
    drawId: existingDraw?.id,
    seed: existingDraw?.seed,
    createdAt: existingDraw?.createdAt,
  });
  if (!fixture.ok) {
    return fixture;
  }
  return {
    ok: true,
    value: {
      stages: [fixture.value.stage],
      groups: [],
      matches: [...fixture.value.matches],
      newDraws:
        existingDraw === undefined && fixture.value.draw !== null ? [fixture.value.draw] : [],
    },
  };
};

export const generateFixture: GenerateFixture = generateKnockoutFixtureContract;
