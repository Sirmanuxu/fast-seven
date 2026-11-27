import { describe, expect, it } from 'vitest';
import { generateFixture } from './fixture';
import {
  previewSwissRound,
  swissPreviewMatches,
} from './swiss';
import {
  Draw,
  Match,
  MatchEvent,
  PRESET_POINTS_3_2_1,
  Team,
  TournamentRules,
} from './model';
import { createSeededRng } from './rng';

const rules: TournamentRules = {
  points: PRESET_POINTS_3_2_1,
  tiebreakers: ['HEAD_TO_HEAD', 'POINT_DIFFERENCE', 'POINTS_FOR', 'TRIES_FOR', 'DRAW'],
  walkoverScore: { winner: 28, loser: 0 },
  bye: { awardsWinPoints: true, countsScore: false },
  roster: { min: 7, max: 12 },
};

function teams(count: number, seeded = false): readonly Team[] {
  return Array.from({ length: count }, (_, index) => {
    const id = `T${index + 1}`;
    return {
      id,
      name: id,
      primaryColor: '#000000',
      secondaryColor: '#ffffff',
      captainId: null,
      logo: null,
      isSeed: seeded,
      status: 'ACTIVE',
    };
  });
}

function completeRound(matches: readonly Match[]): readonly Match[] {
  return matches.map((match, index) =>
    match.status === 'FINISHED'
      ? match
      : {
          ...match,
          status: 'FINISHED',
          result: {
            mode: 'DIRECT',
            homePoints: 14 + index,
            awayPoints: 7,
            definition: 'REGULAR',
            winnerTeamId: null,
          },
        },
  );
}

function completeWithScores(
  matches: readonly Match[],
  scores: Readonly<Record<string, readonly [number, number]>>,
): readonly Match[] {
  return matches.map((match) => {
    if (match.away.kind !== 'TEAM' || match.home.kind !== 'TEAM') return match;
    const key = [match.home.teamId, match.away.teamId].sort().join(':');
    const score = scores[key];
    if (!score) throw new Error(`Missing reference score for ${key}`);
    const [homePoints, awayPoints] =
      match.home.teamId === key.split(':')[0] ? score : [score[1], score[0]];
    return {
      ...match,
      status: 'FINISHED' as const,
      result: {
        mode: 'DIRECT' as const,
        homePoints,
        awayPoints,
        definition: 'REGULAR' as const,
        winnerTeamId: null,
      },
    };
  });
}

function allPairings(matches: readonly Match[]): readonly string[] {
  return matches
    .flatMap((match) =>
      match.home.kind === 'TEAM' && match.away.kind === 'TEAM'
        ? [[match.home.teamId, match.away.teamId].sort().join(':')]
        : [],
    );
}

describe('Swiss fixture generation', () => {
  it('saves a seeded first-round order and pairs the top half against the bottom half', () => {
    const result = generateFixture({
      teams: teams(8, true),
      params: { format: 'SWISS', rounds: 3 },
      draws: [],
      rng: createSeededRng('swiss-seeded'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stages).toMatchObject([{ type: 'SWISS', id: 'swiss-stage' }]);
    expect(result.value.newDraws).toMatchObject([
      { payload: { kind: 'SWISS_ROUND_ONE', teamOrder: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'] } },
    ]);
    expect(allPairings(result.value.matches)).toEqual([
      'T1:T5',
      'T2:T6',
      'T3:T7',
      'T4:T8',
    ]);
  });

  it('assigns an odd-round bye to the last team in the saved initial order', () => {
    const result = generateFixture({
      teams: teams(7, true),
      params: { format: 'SWISS', rounds: 3 },
      draws: [],
      rng: createSeededRng('swiss-odd'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.matches).toHaveLength(4);
    expect(result.value.matches.at(-1)).toMatchObject({
      label: 'Libre (bye)',
      home: { kind: 'TEAM', teamId: 'T7' },
      away: { kind: 'BYE' },
      status: 'FINISHED',
      isPhantom: true,
    });
  });
});

describe('Swiss round previews', () => {
  it.each([7, 8, 9, 16])('generates up to four fair rounds without rematches for n=%i', (count) => {
    const teamRows = teams(count, true);
    const initial = generateFixture({
      teams: teamRows,
      params: { format: 'SWISS', rounds: 4 },
      draws: [],
      rng: createSeededRng(`swiss-${count}`),
    });
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;

    let matches = completeRound(initial.value.matches);
    let draws: readonly Draw[] = initial.value.newDraws;
    const events: readonly MatchEvent[] = [];
    const allPairs = new Set(allPairings(matches));
    const byeTeamIds = new Set(
      matches
        .filter((match) => match.away.kind === 'BYE' && match.home.kind === 'TEAM')
        .map((match) => (match.home.kind === 'TEAM' ? match.home.teamId : '')),
    );

    for (let round = 2; round <= 4; round += 1) {
      const preview = previewSwissRound({
        stageId: 'swiss-stage',
        round,
        teams: teamRows,
        matches,
        events,
        rules,
        draws,
        rng: createSeededRng(`swiss-${count}-${round}`),
      });
      expect(preview.ok).toBe(true);
      if (!preview.ok) return;
      expect(preview.value.repeatedPairingCount).toBe(0);
      expect(preview.value.pairings).toHaveLength(Math.floor(count / 2));
      if (preview.value.byeTeamId) {
        expect(byeTeamIds.has(preview.value.byeTeamId)).toBe(false);
        byeTeamIds.add(preview.value.byeTeamId);
      }

      const nextMatches = swissPreviewMatches(preview.value);
      for (const pair of allPairings(nextMatches)) {
        expect(allPairs.has(pair)).toBe(false);
        allPairs.add(pair);
      }
      matches = completeRound([...matches, ...nextMatches]);
      draws = [...draws, ...preview.value.newDraws];
    }

    expect(matches.filter((match) => match.round <= 4 && !match.isPhantom)).toHaveLength(
      4 * Math.floor(count / 2),
    );
  });

  it('does not preview a later round until every previous match is finished', () => {
    const teamRows = teams(8);
    const initial = generateFixture({
      teams: teamRows,
      params: { format: 'SWISS', rounds: 3 },
      draws: [],
      rng: createSeededRng('swiss-pending'),
    });
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;

    const preview = previewSwissRound({
      stageId: 'swiss-stage',
      round: 2,
      teams: teamRows,
      matches: initial.value.matches,
      events: [],
      rules,
      draws: initial.value.newDraws,
      rng: createSeededRng('swiss-pending-round-two'),
    });
    expect(preview).toMatchObject({
      ok: false,
      error: { code: 'previousRoundIncomplete' },
    });
  });

  it('matches the reference pairings for rounds two and three', () => {
    const teamRows = teams(8, true);
    const initial = generateFixture({
      teams: teamRows,
      params: { format: 'SWISS', rounds: 3 },
      draws: [],
      rng: createSeededRng('swiss-reference'),
    });
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;

    const roundOne = completeWithScores(initial.value.matches, {
      'T1:T5': [21, 7],
      'T2:T6': [14, 7],
      'T3:T7': [12, 5],
      'T4:T8': [19, 5],
    });
    const roundTwoPreview = previewSwissRound({
      stageId: 'swiss-stage',
      round: 2,
      teams: teamRows,
      matches: roundOne,
      events: [],
      rules,
      draws: initial.value.newDraws,
      rng: createSeededRng('swiss-reference-round-two'),
    });
    expect(roundTwoPreview).toMatchObject({
      ok: true,
      value: {
        pairings: [
          { homeTeamId: 'T1', awayTeamId: 'T2' },
          { homeTeamId: 'T4', awayTeamId: 'T3' },
          { homeTeamId: 'T6', awayTeamId: 'T5' },
          { homeTeamId: 'T7', awayTeamId: 'T8' },
        ],
      },
    });
    if (!roundTwoPreview.ok) return;

    const roundTwo = completeWithScores(
      swissPreviewMatches(roundTwoPreview.value),
      {
        'T1:T2': [17, 10],
        'T3:T4': [7, 24],
        'T5:T6': [0, 14],
        'T7:T8': [21, 7],
      },
    );
    const roundThreePreview = previewSwissRound({
      stageId: 'swiss-stage',
      round: 3,
      teams: teamRows,
      matches: [...roundOne, ...roundTwo],
      events: [],
      rules,
      draws: [...initial.value.newDraws, ...roundTwoPreview.value.newDraws],
      rng: createSeededRng('swiss-reference-round-three'),
    });
    expect(roundThreePreview).toMatchObject({
      ok: true,
      value: {
        pairings: [
          { homeTeamId: 'T4', awayTeamId: 'T1' },
          { homeTeamId: 'T2', awayTeamId: 'T7' },
          { homeTeamId: 'T3', awayTeamId: 'T6' },
          { homeTeamId: 'T8', awayTeamId: 'T5' },
        ],
      },
    });
  });

  it('flags a forced rematch and requires confirmation when no clean pairing remains', () => {
    const teamRows = teams(4, true);
    const initial = generateFixture({
      teams: teamRows,
      params: { format: 'SWISS', rounds: 3 },
      draws: [],
      rng: createSeededRng('swiss-forced-rematch'),
    });
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;

    let matches = completeRound(initial.value.matches);
    let draws: readonly Draw[] = initial.value.newDraws;
    for (let round = 2; round <= 3; round += 1) {
      const preview = previewSwissRound({
        stageId: 'swiss-stage',
        round,
        teams: teamRows,
        matches,
        events: [],
        rules,
        draws,
        rng: createSeededRng(`swiss-forced-rematch-${round}`),
      });
      expect(preview.ok).toBe(true);
      if (!preview.ok) return;
      matches = completeRound([...matches, ...swissPreviewMatches(preview.value)]);
      draws = [...draws, ...preview.value.newDraws];
    }

    const preview = previewSwissRound({
      stageId: 'swiss-stage',
      round: 4,
      teams: teamRows,
      matches,
      events: [],
      rules,
      draws,
      rng: createSeededRng('swiss-forced-rematch-four'),
    });
    expect(preview).toMatchObject({
      ok: true,
      value: { requiresConfirmation: true, repeatedPairingCount: 2 },
    });
  });
});
