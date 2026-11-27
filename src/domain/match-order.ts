import { DomainError, Id, Match, MatchRef, Result } from './model';

export type MatchMoveDirection = 'UP' | 'DOWN';

function error(
  code: string,
  params?: Readonly<Record<string, string | number>>,
): Result<never, DomainError> {
  return {
    ok: false,
    error: {
      code,
      messageKey: `matchOrder.${code}`,
      ...(params ? { params } : {}),
    },
  };
}

function isReorderable(match: Match): boolean {
  return match.status === 'PENDING' && !match.isPhantom && !match.isConditional;
}

function sortByOrder(matches: readonly Match[]): readonly Match[] {
  return [...matches].sort(
    (left, right) =>
      left.order - right.order || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  );
}

function validateOrder(matches: readonly Match[]): Result<null, DomainError> {
  const orders = new Set<number>();
  for (const match of matches) {
    if (orders.has(match.order)) return error('duplicateOrder', { order: match.order });
    orders.add(match.order);
  }
  return { ok: true, value: null };
}

function matchDependencies(match: Match): readonly Id[] {
  return [match.home, match.away]
    .filter(
      (reference): reference is Extract<MatchRef, { readonly kind: 'WINNER_OF' | 'LOSER_OF' }> =>
        reference.kind === 'WINNER_OF' || reference.kind === 'LOSER_OF',
    )
    .map((reference) => reference.matchId);
}

function dependencyViolations(matches: readonly Match[]): ReadonlyMap<string, Id> {
  const ordered = sortByOrder(matches);
  const positionById = new Map(ordered.map((match, index) => [match.id, index]));
  const violations = new Map<string, Id>();
  for (const match of ordered) {
    const matchPosition = positionById.get(match.id);
    if (matchPosition === undefined) continue;
    for (const dependencyId of matchDependencies(match)) {
      const dependencyPosition = positionById.get(dependencyId);
      if (dependencyPosition !== undefined && dependencyPosition >= matchPosition) {
        violations.set(`${dependencyId}->${match.id}`, match.id);
      }
    }
  }
  return violations;
}

function newlyBrokenDependency(
  before: readonly Match[],
  after: readonly Match[],
): Id | null {
  const previous = dependencyViolations(before);
  for (const [dependency, dependentId] of dependencyViolations(after)) {
    if (!previous.has(dependency)) return dependentId;
  }
  return null;
}

export function movePendingMatch(
  matches: readonly Match[],
  matchId: Id,
  direction: MatchMoveDirection,
): Result<readonly Match[], DomainError> {
  const orderIsValid = validateOrder(matches);
  if (!orderIsValid.ok) return orderIsValid;

  const ordered = sortByOrder(matches);
  const matchIndex = ordered.findIndex((match) => match.id === matchId);
  if (matchIndex < 0) return error('matchNotFound', { matchId });

  const match = ordered[matchIndex];
  if (match.status !== 'PENDING') return error('matchNotPending', { matchId });
  if (!isReorderable(match)) return error('matchNotReorderable', { matchId });

  const targetIndex = matchIndex + (direction === 'UP' ? -1 : 1);
  if (targetIndex < 0 || targetIndex >= ordered.length) {
    return error('matchAtBoundary', { matchId });
  }
  const neighbor = ordered[targetIndex];
  if (!isReorderable(neighbor)) {
    return error('lockedMatch', { matchId, neighborId: neighbor.id });
  }

  const updatedMatches = matches.map((candidate) => {
    if (candidate.id === match.id) return { ...candidate, order: neighbor.order };
    if (candidate.id === neighbor.id) return { ...candidate, order: match.order };
    return candidate;
  });
  const newlyBrokenMatchId = newlyBrokenDependency(matches, updatedMatches);
  if (newlyBrokenMatchId !== null) {
    return error('dependencyWouldBeBroken', { matchId: newlyBrokenMatchId });
  }
  return { ok: true, value: updatedMatches };
}

export function resetSuggestedMatchOrder(
  matches: readonly Match[],
  suggestedMatchIds: readonly Id[],
): Result<readonly Match[], DomainError> {
  const orderIsValid = validateOrder(matches);
  if (!orderIsValid.ok) return orderIsValid;

  const reorderableIds = sortByOrder(matches)
    .filter(isReorderable)
    .map((match) => match.id);
  if (
    suggestedMatchIds.length !== reorderableIds.length ||
    new Set(suggestedMatchIds).size !== suggestedMatchIds.length ||
    suggestedMatchIds.some((matchId) => !reorderableIds.includes(matchId))
  ) {
    return error('invalidSuggestedOrder');
  }

  const ordered = sortByOrder(matches);
  const orderById = new Map(ordered.map((match) => [match.id, match.order]));
  const reordered = [...ordered];
  let index = 0;
  while (index < ordered.length) {
    if (!isReorderable(ordered[index])) {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < ordered.length && isReorderable(ordered[end])) end += 1;

    const segmentIds = new Set(ordered.slice(index, end).map((match) => match.id));
    const suggestedSegment = suggestedMatchIds
      .filter((matchId) => segmentIds.has(matchId))
      .map((matchId) => ordered.find((match) => match.id === matchId));
    const segmentOrders = ordered.slice(index, end).map((match) => match.order);
    for (let offset = 0; offset < suggestedSegment.length; offset += 1) {
      const suggestedMatch = suggestedSegment[offset];
      if (suggestedMatch) {
        const targetIndex = index + offset;
        reordered[targetIndex] = { ...suggestedMatch, order: segmentOrders[offset] };
      }
    }
    index = end;
  }

  const orderIsDependencySafe = newlyBrokenDependency(matches, reordered);
  if (orderIsDependencySafe !== null) {
    return error('dependencyWouldBeBroken', { matchId: orderIsDependencySafe });
  }

  for (const match of reordered) orderById.set(match.id, match.order);
  return {
    ok: true,
    value: matches.map((match) => {
      const order = orderById.get(match.id);
      return order === undefined || order === match.order ? match : { ...match, order };
    }),
  };
}
