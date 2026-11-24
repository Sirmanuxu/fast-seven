import { ComputeScorers, Id, Player, ScorerRow } from './model';

function isExcludedMatch(match: Parameters<ComputeScorers>[0]['matches'][number]): boolean {
  return (
    match.result?.mode === 'DIRECT' ||
    match.result?.mode === 'WALKOVER' ||
    match.result?.definition === 'WALKOVER'
  );
}

function comparePlayers(left: Player, right: Player): number {
  return (
    left.lastName.localeCompare(right.lastName, 'es') ||
    left.firstName.localeCompare(right.firstName, 'es') ||
    left.id.localeCompare(right.id)
  );
}

export const computeScorers: ComputeScorers = ({ players, matches, events, filter }) => {
  const eligibleMatchIds = new Set(
    matches.filter((match) => !isExcludedMatch(match)).map((match) => match.id),
  );
  const playerById = new Map(players.map((player) => [player.id, player]));
  const counts = new Map<Id, { tries: number; conversions: number }>();
  let unattributedTries = 0;

  for (const event of events) {
    if (!eligibleMatchIds.has(event.matchId)) {
      continue;
    }
    if (event.playerId === null) {
      if (event.type === 'TRY') {
        unattributedTries += 1;
      }
      continue;
    }

    const player = playerById.get(event.playerId);
    if (
      !player ||
      (filter?.category !== undefined && player.category !== filter.category) ||
      (filter?.gender !== undefined && player.gender !== filter.gender)
    ) {
      continue;
    }

    const playerCounts = counts.get(player.id) ?? { tries: 0, conversions: 0 };
    if (event.type === 'TRY') {
      playerCounts.tries += 1;
    } else {
      playerCounts.conversions += 1;
    }
    counts.set(player.id, playerCounts);
  }

  const rows: ScorerRow[] = [...counts.entries()]
    .map(([playerId, playerCounts]) => {
      const player = playerById.get(playerId);
      if (!player) {
        return null;
      }
      return {
        playerId,
        teamId: player.teamId,
        tries: playerCounts.tries,
        conversions: playerCounts.conversions,
        points: playerCounts.tries * 5 + playerCounts.conversions * 2,
        player,
      };
    })
    .filter(
      (
        row,
      ): row is ScorerRow & {
        readonly player: Player;
      } => row !== null,
    )
    .sort(
      (left, right) =>
        right.points - left.points ||
        right.tries - left.tries ||
        comparePlayers(left.player, right.player),
    )
    .map((row) => ({
      playerId: row.playerId,
      teamId: row.teamId,
      tries: row.tries,
      conversions: row.conversions,
      points: row.points,
    }));

  return { rows, unattributedTries };
};
