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
  Rng,
  Stage,
} from './model';
import { generateKnockoutMatches, getKnockoutBracketSize } from './knockout';
import { generateRoundRobinMatches } from './round-robin';
import { createGroupDrawPlan, groupsFromPlan } from './group-draw';

export interface GroupsKnockoutFixtureInput {
  readonly groups: readonly Group[];
  readonly qualifiersPerGroup: number;
  readonly thirdPlaceMatch?: boolean;
  readonly groupStageId?: string;
  readonly knockoutStageId?: string;
  readonly matchIdPrefix?: string;
  readonly levelRankings?: readonly (readonly Id[])[];
  readonly rng?: Rng;
  readonly drawId?: string;
  readonly seed?: string;
  readonly createdAt?: string;
}

export interface GroupsKnockoutFixture {
  readonly stages: readonly Stage[];
  readonly groups: readonly Group[];
  readonly matches: readonly Match[];
  readonly draw: Draw | null;
  readonly explanation: {
    readonly avoidsSameGroupMatches: boolean;
    readonly impossibleSameGroupAvoidance: boolean;
  };
}

function error(
  code: string,
  params?: Readonly<Record<string, string | number>>,
): Result<never, DomainError> {
  return { ok: false, error: { code, messageKey: `groupsKnockout.${code}`, params } };
}

function groupIdForTeam(groups: readonly Group[], teamId: Id): Id | null {
  return groups.find((group) => group.teamIds.includes(teamId))?.id ?? null;
}

function levelRefs(
  groups: readonly Group[],
  level: number,
  ranking: readonly Id[] | undefined,
): readonly MatchRef[] {
  const candidates = groups
    .map((group) => ({
      groupId: group.id,
      teamIds: group.teamIds,
    }))
    .flatMap(({ groupId, teamIds }) =>
      teamIds
        .map((teamId) => ({ teamId, position: teamIds.indexOf(teamId) + 1 }))
        .filter(({ position }) => position === level)
        .map(({ teamId, position }) => ({ teamId, position, groupId })),
    );

  const rankedSet = new Set(ranking ?? []);
  const ranked = (ranking ?? [])
    .map((teamId) =>
      candidates.find((candidate) => candidate.teamId === teamId),
    )
    .filter((candidate): candidate is (typeof candidates)[number] => candidate !== undefined);
  const remaining = candidates.filter((candidate) => !rankedSet.has(candidate.teamId));

  return [...ranked, ...remaining].map(({ groupId, position }) => ({
    kind: 'GROUP_POSITION',
    groupId,
    position,
  }));
}

function slotGroupId(ref: MatchRef, groups: readonly Group[]): Id | null {
  if (ref.kind !== 'GROUP_POSITION') {
    if (ref.kind === 'TEAM') {
      return groupIdForTeam(groups, ref.teamId);
    }
    return null;
  }
  return ref.groupId;
}

function avoidSameGroupPairs(
  slots: readonly MatchRef[],
  groups: readonly Group[],
): { readonly slots: readonly MatchRef[]; readonly impossible: boolean } {
  const reordered = [...slots];
  let impossible = false;
  for (let pairStart = 0; pairStart < reordered.length - 1; pairStart += 2) {
    const leftGroup = slotGroupId(reordered[pairStart], groups);
    const rightGroup = slotGroupId(reordered[pairStart + 1], groups);
    if (
      leftGroup === null ||
      rightGroup === null ||
      reordered[pairStart].kind === 'BYE' ||
      reordered[pairStart + 1].kind === 'BYE' ||
      leftGroup !== rightGroup
    ) {
      continue;
    }

    let swapped = false;
    for (let scan = pairStart + 2; scan < reordered.length; scan += 1) {
      if (reordered[scan].kind === 'BYE') {
        continue;
      }
      const candidateGroup = slotGroupId(reordered[scan], groups);
      if (
        candidateGroup !== null &&
        candidateGroup !== leftGroup &&
        candidateGroup !== rightGroup
      ) {
        const saved = reordered[pairStart + 1];
        reordered[pairStart + 1] = reordered[scan];
        reordered[scan] = saved;
        swapped = true;
        break;
      }
    }
    if (!swapped) {
      impossible = true;
    }
  }

  return { slots: reordered, impossible };
}

export function generateGroupsKnockoutFixture(
  input: GroupsKnockoutFixtureInput,
): Result<GroupsKnockoutFixture, DomainError> {
  if (input.groups.length < 2) {
    return error('tooFewGroups', { minimum: 2 });
  }
  if (!Number.isInteger(input.qualifiersPerGroup) || input.qualifiersPerGroup < 1) {
    return error('invalidQualifierCount');
  }
  if (
    input.groups.some(
      (group) => group.teamIds.length < input.qualifiersPerGroup,
    )
  ) {
    return error('insufficientGroupSize');
  }
  if (
    new Set(input.groups.flatMap((group) => group.teamIds)).size !==
    input.groups.flatMap((group) => group.teamIds).length
  ) {
    return error('duplicateTeams');
  }

  const groupStageId = input.groupStageId ?? 'groups-stage';
  const knockoutStageId = input.knockoutStageId ?? 'groups-knockout-stage';
  const stages: Stage[] = [
    {
      id: groupStageId,
      type: 'GROUPS',
      name: 'Fase de grupos',
      order: 1,
      cup: null,
    },
    {
      id: knockoutStageId,
      type: 'KNOCKOUT',
      name: 'Eliminación directa',
      order: 2,
      cup: null,
    },
  ];

  const matches: Match[] = [];
  let globalOrder = 1;
  const roundMatches = new Map<number, readonly Match[]>();
  for (const group of input.groups) {
    const fixture = generateRoundRobinMatches({
      teamIds: group.teamIds,
      rounds: 1,
      stageId: groupStageId,
      groupId: group.id,
      matchIdPrefix: `${input.matchIdPrefix ?? 'groups'}-${group.id}`,
    });
    if (!fixture.ok) {
      return fixture;
    }
    for (const match of fixture.value) {
      const entries = roundMatches.get(match.round) ?? [];
      roundMatches.set(match.round, [...entries, match]);
    }
  }
  const roundNumbers = [...roundMatches.keys()].sort((left, right) => left - right);
  for (const round of roundNumbers) {
    for (const match of roundMatches.get(round) ?? []) {
      matches.push({ ...match, order: globalOrder });
      globalOrder += 1;
    }
  }

  const refs: MatchRef[] = [];
  for (let level = 1; level <= input.qualifiersPerGroup; level += 1) {
    refs.push(...levelRefs(input.groups, level, input.levelRankings?.[level - 1]));
  }

  const bracketSize = getKnockoutBracketSize(refs.length);
  const bracketSlots: MatchRef[] = [
    ...refs,
    ...Array.from({ length: bracketSize - refs.length }, () => ({ kind: 'BYE' }) as MatchRef),
  ];
  const seedSlots: MatchRef[] = [];
  const seedCount = bracketSize;
  const seedOrder = seedOrderForSize(seedCount);
  for (const seed of seedOrder) {
    seedSlots.push(seed <= refs.length ? bracketSlots[seed - 1] : { kind: 'BYE' });
  }
  const separated = avoidSameGroupPairs(seedSlots, input.groups);

  const qualifierCount = refs.length;
  const knockout = generateKnockoutMatches({
    teamIds: Array.from({ length: qualifierCount }, (_, index) => `qualifier-${index + 1}`),
    stageId: knockoutStageId,
    stageName: 'Eliminación directa',
    thirdPlaceMatch: input.thirdPlaceMatch === true,
    matchIdPrefix: `${input.matchIdPrefix ?? 'groups'}-knockout`,
    slotRefs: separated.slots,
  });
  if (!knockout.ok) {
    return knockout;
  }
  for (const match of knockout.value) {
    matches.push({ ...match, order: globalOrder });
    globalOrder += 1;
  }

  return {
    ok: true,
    value: {
      stages,
      groups: input.groups,
      matches,
      draw: null,
      explanation: {
        avoidsSameGroupMatches: !separated.impossible,
        impossibleSameGroupAvoidance: separated.impossible,
      },
    },
  };
}

function seedOrderForSize(bracketSize: number): readonly number[] {
  let order: number[] = [1, 2];
  for (let size = 4; size <= bracketSize; size *= 2) {
    order = order.flatMap((seed) => [seed, size + 1 - seed]);
  }
  return order;
}

export const generateGroupsKnockoutFixtureContract: GenerateFixture = (input) => {
  if (input.params.format !== 'GROUPS_KNOCKOUT') {
    return error('unsupportedFormat');
  }
  const params: Extract<FormatParams, { readonly format: 'GROUPS_KNOCKOUT' }> = input.params;
  if (input.teams.length < params.groupCount) {
    return error('tooFewTeams', { minimum: params.groupCount });
  }

  const existingDraw = input.draws.find((draw) => draw.payload.kind === 'GROUPS');
  let groupTeamIds: readonly (readonly Id[])[];
  let newGroupDraw: Draw | null = null;
  if (existingDraw?.payload.kind === 'GROUPS') {
    groupTeamIds = existingDraw.payload.groups;
  } else {
    const plan = createGroupDrawPlan({
      teams: input.teams,
      groupCount: params.groupCount,
      drawId: 'groups-knockout-groups-draw',
      seed: 'groups-knockout',
      createdAt: '1970-01-01T00:00:00.000Z',
      rng: input.rng,
    });
    if (!plan.ok) {
      return plan;
    }
    groupTeamIds = plan.value.groupTeamIds;
    newGroupDraw = plan.value.draw;
  }
  const groups = groupsFromPlan(
    'groups-stage',
    groupTeamIds,
  );
  const fixture = generateGroupsKnockoutFixture({
    groups,
    qualifiersPerGroup: params.qualifiersPerGroup,
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
