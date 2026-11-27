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
import { getKnockoutBracketSize, getStandardSeedOrder } from './knockout';

const WINNERS_STAGE_ID = 'double-winners';
const LOSERS_STAGE_ID = 'double-losers';
const GRAND_FINAL_STAGE_ID = 'double-grand-final';

function error(code: string): Result<never, DomainError> {
  return { ok: false, error: { code, messageKey: `doubleElimination.${code}` } };
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

function buildMatch(input: {
  readonly id: Id;
  readonly stageId: Id;
  readonly round: number;
  readonly order: number;
  readonly label: string | null;
  readonly home: MatchRef;
  readonly away: MatchRef;
  readonly isConditional?: boolean;
}): Match {
  return {
    id: input.id,
    stageId: input.stageId,
    groupId: null,
    round: input.round,
    order: input.order,
    label: input.label,
    home: input.home,
    away: input.away,
    status: 'PENDING',
    result: null,
    startedAt: null,
    finishedAt: null,
    isPhantom: false,
    isConditional: input.isConditional ?? false,
  };
}

function buildTeamOrder(
  teams: readonly Team[],
  rng: Rng,
  existingDraw: Draw | undefined,
): readonly Id[] {
  if (existingDraw?.payload.kind === 'BRACKET') {
    return existingDraw.payload.teamOrder;
  }
  const active = teams.filter((team) => team.status === 'ACTIVE');
  const seeded = active.filter((team) => team.isSeed).map((team) => team.id);
  const unseeded = active.filter((team) => !team.isSeed).map((team) => team.id);
  return [...seeded, ...rng.shuffle(unseeded)];
}

export function generateDoubleEliminationFixture(input: {
  readonly teams: readonly Team[];
  readonly grandFinalReset: boolean;
  readonly rng: Rng;
  readonly existingDraw?: Draw;
  readonly drawId?: Id;
  readonly seed?: string;
  readonly createdAt?: string;
}): Result<
  {
    readonly stages: readonly Stage[];
    readonly matches: readonly Match[];
    readonly draw: Draw;
    readonly teamOrder: readonly Id[];
  },
  DomainError
> {
  const activeTeams = input.teams.filter((team) => team.status === 'ACTIVE');
  if (activeTeams.length < 3) return error('tooFewTeams');
  if (new Set(activeTeams.map((team) => team.id)).size !== activeTeams.length) {
    return error('duplicateTeams');
  }

  const teamOrder = buildTeamOrder(activeTeams, input.rng, input.existingDraw);
  if (
    teamOrder.length !== activeTeams.length ||
    new Set(teamOrder).size !== teamOrder.length ||
    teamOrder.some((teamId) => !activeTeams.some((team) => team.id === teamId))
  ) {
    return error('invalidTeamOrder');
  }

  const bracketSize = getKnockoutBracketSize(activeTeams.length);
  const seedOrder = getStandardSeedOrder(bracketSize);
  const slots: readonly MatchRef[] = seedOrder.map((seed) =>
    seed <= teamOrder.length ? teamRef(teamOrder[seed - 1]) : { kind: 'BYE' },
  );
  const stages: Stage[] = [
    {
      id: WINNERS_STAGE_ID,
      type: 'WINNERS_BRACKET',
      name: 'Llave de ganadores',
      order: 1,
      cup: null,
    },
    {
      id: LOSERS_STAGE_ID,
      type: 'LOSERS_BRACKET',
      name: 'Llave de perdedores',
      order: 2,
      cup: null,
    },
    {
      id: GRAND_FINAL_STAGE_ID,
      type: 'GRAND_FINAL',
      name: 'Final',
      order: 3,
      cup: null,
    },
  ];

  const matches: Match[] = [];
  let order = 1;
  const winnersByRound: Id[][] = [];
  let roundSlots: readonly MatchRef[] = slots;

  const winnersRoundCount = Math.log2(bracketSize);
  for (let round = 1; round <= winnersRoundCount; round += 1) {
    const roundMatches: Id[] = [];
    for (let index = 0; index < roundSlots.length; index += 2) {
      const home = roundSlots[index];
      const away = roundSlots[index + 1] ?? ({ kind: 'BYE' } as MatchRef);
      if (home.kind === 'BYE' || away.kind === 'BYE') {
        continue;
      }
      const id = `${WINNERS_STAGE_ID}-round-${round}-match-${index / 2 + 1}`;
      matches.push(
        buildMatch({
          id,
          stageId: WINNERS_STAGE_ID,
          round,
          order,
          label:
            round === winnersRoundCount
              ? 'Final de ganadores'
              : round === winnersRoundCount - 1
                ? 'Semifinal de ganadores'
                : null,
          home,
          away,
        }),
      );
      roundMatches.push(id);
      order += 1;
    }
    winnersByRound.push(roundMatches);
    roundSlots = roundMatches.map((matchId) => winnerRef(matchId));
  }

  const losersMatches: Match[] = [];
  let loserRound = 1;

  const firstWinners = winnersByRound[0];
  const firstLoserPairs: Id[] = [];
  for (let index = 0; index < firstWinners.length; index += 2) {
    if (!firstWinners[index + 1]) break;
    const id = `${LOSERS_STAGE_ID}-round-${loserRound}-match-${index / 2 + 1}`;
    losersMatches.push(
      buildMatch({
        id,
        stageId: LOSERS_STAGE_ID,
        round: loserRound,
        order,
        label: 'Primera caída',
        home: loserRef(firstWinners[index]),
        away: loserRef(firstWinners[index + 1]),
      }),
    );
    firstLoserPairs.push(id);
    order += 1;
  }

  let previousLoserWinners = firstLoserPairs;
  for (let winnersRound = 2; winnersRound <= winnersRoundCount; winnersRound += 1) {
    loserRound += 1;
    const winnersLosers = winnersByRound[winnersRound - 1];
    const dropMatches: Id[] = [];
    for (let index = 0; index < winnersLosers.length; index += 1) {
      const priorWinner =
        previousLoserWinners[index] !== undefined
          ? winnerRef(previousLoserWinners[index])
          : { kind: 'BYE' } as MatchRef;
      const id = `${LOSERS_STAGE_ID}-round-${loserRound}-match-${index + 1}`;
      losersMatches.push(
        buildMatch({
          id,
          stageId: LOSERS_STAGE_ID,
          round: loserRound,
          order,
          label: 'Ronda de caída',
          home: priorWinner,
          away: loserRef(winnersLosers[index]),
        }),
      );
      dropMatches.push(id);
      order += 1;
    }

    let currentLoserWinners = dropMatches;
    if (
      winnersRound < winnersRoundCount &&
      dropMatches.length >= 2
    ) {
      loserRound += 1;
      const internalMatches: Id[] = [];
      for (let index = 0; index < dropMatches.length; index += 2) {
        if (!dropMatches[index + 1]) break;
        const id = `${LOSERS_STAGE_ID}-round-${loserRound}-match-${index / 2 + 1}`;
        losersMatches.push(
          buildMatch({
            id,
            stageId: LOSERS_STAGE_ID,
            round: loserRound,
            order,
            label: 'Ronda interna de perdedores',
            home: winnerRef(dropMatches[index]),
            away: winnerRef(dropMatches[index + 1]),
          }),
        );
        internalMatches.push(id);
        order += 1;
      }
      currentLoserWinners = internalMatches;
    }
    previousLoserWinners = currentLoserWinners;
  }

  matches.push(...losersMatches);
  const winnersFinalId = winnersByRound[winnersRoundCount - 1][0];
  const losersFinalId = previousLoserWinners[0];
  if (!winnersFinalId || !losersFinalId) return error('invalidBracket');

  const grandFinalId = `${GRAND_FINAL_STAGE_ID}-match-1`;
  matches.push(
    buildMatch({
      id: grandFinalId,
      stageId: GRAND_FINAL_STAGE_ID,
      round: 1,
      order,
      label: 'Gran final',
      home: winnerRef(winnersFinalId),
      away: winnerRef(losersFinalId),
    }),
  );
  order += 1;

  if (input.grandFinalReset) {
    matches.push(
      buildMatch({
        id: `${GRAND_FINAL_STAGE_ID}-reset`,
        stageId: GRAND_FINAL_STAGE_ID,
        round: 2,
        order,
        label: 'Final con reinicio',
        home: winnerRef(grandFinalId),
        away: loserRef(grandFinalId),
        isConditional: true,
      }),
    );
  }

  const draw: Draw = input.existingDraw ?? {
    id: input.drawId ?? `${WINNERS_STAGE_ID}-draw`,
    seed: input.seed ?? 'double-elimination',
    createdAt: input.createdAt ?? '1970-01-01T00:00:00.000Z',
    payload: { kind: 'BRACKET', stageId: WINNERS_STAGE_ID, teamOrder },
  };

  return {
    ok: true,
    value: { stages, matches, draw, teamOrder },
  };
}

export const generateDoubleEliminationFixtureContract: GenerateFixture = (input) => {
  if (input.params.format !== 'DOUBLE_ELIMINATION') {
    return error('unsupportedFormat');
  }
  const params: Extract<FormatParams, { readonly format: 'DOUBLE_ELIMINATION' }> = input.params;
  const existingDraw = input.draws.find(
    (draw) =>
      draw.payload.kind === 'BRACKET' && draw.payload.stageId === WINNERS_STAGE_ID,
  );
  const fixture = generateDoubleEliminationFixture({
    teams: input.teams,
    grandFinalReset: params.grandFinalReset,
    rng: input.rng,
    existingDraw,
  });
  if (!fixture.ok) return fixture;
  return {
    ok: true,
    value: {
      stages: [...fixture.value.stages],
      groups: [],
      matches: [...fixture.value.matches],
      newDraws: existingDraw ? [] : [fixture.value.draw],
    },
  };
};
