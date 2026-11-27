import {
  DomainError,
  Draw,
  FormatParams,
  GenerateFixture,
  Group,
  Id,
  Match,
  MatchRef,
  Result,
  Stage,
} from './model';
import { createGroupDrawPlan, groupsFromPlan } from './group-draw';
import { generateKnockoutMatches, getKnockoutBracketSize, getStandardSeedOrder } from './knockout';
import { generateRoundRobinMatches } from './round-robin';

export interface GroupsCupsFixtureInput {
  readonly groups: readonly Group[];
  readonly thirdPlaceMatch?: boolean;
  readonly groupStageId?: string;
  readonly matchIdPrefix?: string;
}

export interface GroupsCupsFixture {
  readonly stages: readonly Stage[];
  readonly groups: readonly Group[];
  readonly matches: readonly Match[];
}

const CUP_NAMES = ['Copa de Oro', 'Copa de Plata', 'Copa de Bronce', 'Copa de Cobre'] as const;
const CUP_CODES = ['GOLD', 'SILVER', 'BRONZE', 'COPPER'] as const;

function error(
  code: string,
  params?: Readonly<Record<string, string | number>>,
): Result<never, DomainError> {
  return { ok: false, error: { code, messageKey: `groupsCups.${code}`, params } };
}

function cupName(level: number): string {
  return CUP_NAMES[level - 1] ?? `Copa ${level}`;
}

function cupCode(level: number): string {
  return CUP_CODES[level - 1] ?? `CUP_${level}`;
}

function levelRefs(groups: readonly Group[], level: number): readonly MatchRef[] {
  const participantCount = groups.filter((group) => group.teamIds.length >= level).length;
  return Array.from(
    { length: participantCount },
    (_, index): MatchRef => ({
      kind: 'LEVEL_POSITION',
      level,
      position: index + 1,
    }),
  );
}

function interleaveGroupRounds(
  groups: readonly Group[],
  stageId: Id,
  matchIdPrefix: string,
): Result<readonly Match[], DomainError> {
  const roundMatches = new Map<number, Match[]>();
  for (const group of groups) {
    const fixture = generateRoundRobinMatches({
      teamIds: group.teamIds,
      rounds: 1,
      stageId,
      groupId: group.id,
      matchIdPrefix: `${matchIdPrefix}-${group.id}`,
    });
    if (!fixture.ok) {
      return fixture;
    }
    for (const match of fixture.value) {
      const entries = roundMatches.get(match.round) ?? [];
      entries.push(match);
      roundMatches.set(match.round, entries);
    }
  }

  const matches: Match[] = [];
  for (const round of [...roundMatches.keys()].sort((left, right) => left - right)) {
    for (const match of roundMatches.get(round) ?? []) {
      matches.push({ ...match, order: matches.length + 1 });
    }
  }
  return { ok: true, value: matches };
}

export function generateGroupsCupsFixture(
  input: GroupsCupsFixtureInput,
): Result<GroupsCupsFixture, DomainError> {
  if (input.groups.length < 2) {
    return error('tooFewGroups', { minimum: 2 });
  }
  if (input.groups.some((group) => group.teamIds.length < 2)) {
    return error('insufficientGroupSize');
  }
  const allTeamIds = input.groups.flatMap((group) => group.teamIds);
  if (new Set(allTeamIds).size !== allTeamIds.length) {
    return error('duplicateTeams');
  }

  const groupStageId = input.groupStageId ?? 'groups-cups-groups-stage';
  const prefix = input.matchIdPrefix ?? 'groups-cups';
  const groupMatches = interleaveGroupRounds(input.groups, groupStageId, prefix);
  if (!groupMatches.ok) {
    return groupMatches;
  }

  const maxGroupSize = Math.max(...input.groups.map((group) => group.teamIds.length));
  const unevenGroups = new Set(input.groups.map((group) => group.teamIds.length)).size > 1;
  const lastCupLevel = Array.from({ length: maxGroupSize }, (_, index) => index + 1)
    .filter((level) => input.groups.filter((group) => group.teamIds.length >= level).length >= 2)
    .at(-1);
  const stages: Stage[] = [
    { id: groupStageId, type: 'GROUPS', name: 'Fase de grupos', order: 1, cup: null },
  ];
  const matches: Match[] = [...groupMatches.value];
  const cupFinals: { readonly level: number; readonly match: Match }[] = [];
  let globalOrder = matches.length + 1;

  for (let level = 1; level <= maxGroupSize; level += 1) {
    const refs = levelRefs(input.groups, level);
    if (refs.length < 2) {
      continue;
    }

    const stageId = `${prefix}-${cupCode(level).toLowerCase()}-stage`;
    const participantCount = refs.length;
    const unevenFinalCup = unevenGroups && level === lastCupLevel;
    const name = unevenFinalCup
      ? `${cupName(level)} (${participantCount} equipos; grupos desparejos)`
      : cupName(level);
    stages.push({
      id: stageId,
      type: 'CUP',
      name,
      order: stages.length + 1,
      cup: cupCode(level),
    });

    const bracketSize = getKnockoutBracketSize(participantCount);
    const slots: MatchRef[] = getStandardSeedOrder(bracketSize).map((seed) =>
      seed <= participantCount ? refs[seed - 1] : { kind: 'BYE' },
    );
    const cupMatches = generateKnockoutMatches({
      teamIds: refs.map((_, index) => `${stageId}-seed-${index + 1}`),
      stageId,
      thirdPlaceMatch: input.thirdPlaceMatch === true,
      matchIdPrefix: `${stageId}`,
      slotRefs: slots,
    });
    if (!cupMatches.ok) {
      return cupMatches;
    }
    for (const match of cupMatches.value) {
      if (match.label === 'Final') {
        cupFinals.push({ level, match });
      } else {
        matches.push({ ...match, order: globalOrder });
        globalOrder += 1;
      }
    }
  }

  for (const { match } of cupFinals.sort((left, right) => right.level - left.level)) {
    matches.push({ ...match, order: globalOrder });
    globalOrder += 1;
  }

  return { ok: true, value: { stages, groups: input.groups, matches } };
}

export const generateGroupsCupsFixtureContract: GenerateFixture = (input) => {
  if (input.params.format !== 'GROUPS_CUPS') {
    return error('unsupportedFormat');
  }
  const params: Extract<FormatParams, { readonly format: 'GROUPS_CUPS' }> = input.params;
  if (params.groupCount < 2 || !Number.isInteger(params.groupCount)) {
    return error('invalidGroupCount');
  }
  if (input.teams.length < params.groupCount * 2) {
    return error('insufficientTeams', { minimum: params.groupCount * 2 });
  }

  const existingDraw = input.draws.find(
    (draw) => draw.payload.kind === 'GROUPS' && draw.payload.groups.length === params.groupCount,
  );
  let groupTeamIds: readonly (readonly Id[])[];
  let newGroupDraw: Draw | null = null;
  if (existingDraw?.payload.kind === 'GROUPS') {
    groupTeamIds = existingDraw.payload.groups;
  } else {
    const plan = createGroupDrawPlan({
      teams: input.teams,
      groupCount: params.groupCount,
      drawId: 'groups-cups-groups-draw',
      seed: 'groups-cups',
      createdAt: '1970-01-01T00:00:00.000Z',
      rng: input.rng,
    });
    if (!plan.ok) {
      return plan;
    }
    groupTeamIds = plan.value.groupTeamIds;
    newGroupDraw = plan.value.draw;
  }

  const groups = groupsFromPlan('groups-cups-groups-stage', groupTeamIds);
  const fixture = generateGroupsCupsFixture({
    groups,
    thirdPlaceMatch: params.thirdPlaceMatch,
  });
  if (!fixture.ok) {
    return fixture;
  }

  return {
    ok: true,
    value: {
      stages: [...fixture.value.stages],
      groups: [...fixture.value.groups],
      matches: [...fixture.value.matches],
      newDraws: newGroupDraw === null ? [] : [newGroupDraw],
    },
  };
};
