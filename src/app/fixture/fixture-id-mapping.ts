import { Draw, DrawPayload, GenerateFixture, Id, Match, MatchRef } from '../../domain/model';

export type GeneratedFixture = Extract<ReturnType<GenerateFixture>, { readonly ok: true }>['value'];

export interface PersistableFixture {
  readonly stages: GeneratedFixture['stages'];
  readonly groups: GeneratedFixture['groups'];
  readonly matches: GeneratedFixture['matches'];
  readonly draws: readonly Draw[];
}

export function assignGeneratedFixtureIds(
  fixture: GeneratedFixture,
  createId: () => Id,
  seed: string,
  createdAt: string,
): PersistableFixture {
  const stageIds = new Map(fixture.stages.map((stage) => [stage.id, createId()]));
  const groupIds = new Map(fixture.groups.map((group) => [group.id, createId()]));
  const matchIds = new Map(fixture.matches.map((match) => [match.id, createId()]));
  const drawIds = new Map(fixture.newDraws.map((draw) => [draw.id, createId()]));
  const getId = (ids: ReadonlyMap<Id, Id>, id: Id): Id => {
    const mappedId = ids.get(id);
    if (!mappedId) throw new Error(`Generated fixture references an unknown id: ${id}`);
    return mappedId;
  };
  const mapMatchRef = (reference: MatchRef): MatchRef => {
    if (reference.kind === 'GROUP_POSITION') {
      return { ...reference, groupId: getId(groupIds, reference.groupId) };
    }
    if (reference.kind === 'WINNER_OF' || reference.kind === 'LOSER_OF') {
      return { ...reference, matchId: getId(matchIds, reference.matchId) };
    }
    return reference;
  };
  const mapDrawPayload = (payload: DrawPayload): DrawPayload => {
    if (
      payload.kind === 'BRACKET' ||
      payload.kind === 'BYE' ||
      payload.kind === 'SWISS_ROUND_ONE'
    ) {
      return { ...payload, stageId: getId(stageIds, payload.stageId) };
    }
    return payload;
  };

  const stages = fixture.stages.map((stage) => ({
    ...stage,
    id: getId(stageIds, stage.id),
  }));
  const groups = fixture.groups.map((group) => ({
    ...group,
    id: getId(groupIds, group.id),
    stageId: getId(stageIds, group.stageId),
  }));
  const matches: Match[] = fixture.matches.map((match) => ({
    ...match,
    id: getId(matchIds, match.id),
    stageId: getId(stageIds, match.stageId),
    groupId: match.groupId === null ? null : getId(groupIds, match.groupId),
    home: mapMatchRef(match.home),
    away: mapMatchRef(match.away),
  }));
  const draws = fixture.newDraws.map((draw) => ({
    ...draw,
    id: getId(drawIds, draw.id),
    seed,
    createdAt,
    payload: mapDrawPayload(draw.payload),
  }));

  return { stages, groups, matches, draws };
}
