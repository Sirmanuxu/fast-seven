import { describe, expect, it } from 'vitest';
import { Match, Player, Team, TournamentSnapshot } from '../../domain/model';
import { buildProjectorViewModel, getContrastingTextColor } from './projector-view-model';

const teams: readonly Team[] = [
  {
    id: 'home',
    name: 'Club del Sur',
    primaryColor: '#ffffff',
    secondaryColor: '#000000',
    captainId: null,
    logo: null,
    isSeed: false,
    status: 'ACTIVE',
  },
  {
    id: 'away',
    name: 'Club del Norte',
    primaryColor: '#000000',
    secondaryColor: '#ffffff',
    captainId: null,
    logo: null,
    isSeed: false,
    status: 'ACTIVE',
  },
];

const player: Player = {
  id: 'player',
  firstName: 'Ana',
  lastName: 'Pérez',
  category: 'M16',
  gender: 'F',
  teamId: 'home',
  disambiguation: '(2)',
  normalizedKey: 'ana perez m16',
};

const currentMatch: Match = {
  id: 'match',
  stageId: 'league',
  groupId: null,
  round: 1,
  order: 1,
  label: null,
  home: { kind: 'TEAM', teamId: 'home' },
  away: { kind: 'TEAM', teamId: 'away' },
  status: 'IN_PROGRESS',
  result: null,
  startedAt: '2026-11-27T12:00:00.000Z',
  finishedAt: null,
  isPhantom: false,
  isConditional: false,
};

const snapshot: TournamentSnapshot = {
  tournament: {
    id: 'tournament',
    name: 'Seven del Sur',
    date: '2026-11-27T00:00:00.000Z',
    status: 'RUNNING',
    formatParams: { format: 'ROUND_ROBIN', rounds: 1 },
    rules: {
      points: {
        win: 3,
        draw: 2,
        loss: 1,
        walkoverLoss: 0,
        bonus: {
          triesThreshold: null,
          triesBonusPoints: 0,
          losingMarginMax: null,
          losingBonusPoints: 0,
        },
      },
      tiebreakers: ['DRAW'],
      walkoverScore: { winner: 28, loser: 0 },
      bye: { awardsWinPoints: true, countsScore: false },
      roster: { min: 7, max: null },
    },
    schedule: {
      startTime: '2026-11-27T12:00:00.000Z',
      matchDurationMin: 14,
      restMin: 3,
      breaks: [],
    },
    categories: [],
    backupIntervalMin: 15,
    schemaVersion: 2,
    createdAt: '2026-11-27T00:00:00.000Z',
    updatedAt: '2026-11-27T00:00:00.000Z',
  },
  players: [player],
  teams,
  stages: [{ id: 'league', type: 'LEAGUE', name: 'Liga', order: 1, cup: null }],
  groups: [],
  matches: [currentMatch],
  events: [
    {
      id: 'try',
      matchId: 'match',
      teamId: 'home',
      type: 'TRY',
      playerId: 'player',
      createdAt: '2026-11-27T12:01:00.000Z',
    },
  ],
  draws: [],
};

describe('projector view model', () => {
  it('chooses WCAG-contrasting black or white text for team colors', () => {
    expect(getContrastingTextColor('#ffffff')).toBe('#000000');
    expect(getContrastingTextColor('#000000')).toBe('#ffffff');
  });

  it('shows the in-progress score and the latest try author in the match plate', () => {
    const view = buildProjectorViewModel(snapshot, null, Date.parse('2026-11-27T12:02:00.000Z'));

    expect(view.activeView).toBe('MATCH_PLATE');
    expect(view.currentMatch).toMatchObject({
      homeName: 'Club del Sur',
      awayName: 'Club del Norte',
      homeScore: 5,
      awayScore: 0,
      lastTry: 'Club del Sur · Ana Pérez (2)',
    });
  });

  it('can display a recently finished match and its final score', () => {
    const finishedSnapshot: TournamentSnapshot = {
      ...snapshot,
      matches: [
        {
          ...currentMatch,
          status: 'FINISHED',
          result: {
            mode: 'DIRECT',
            homePoints: 12,
            awayPoints: 7,
            definition: 'REGULAR',
            winnerTeamId: null,
          },
          finishedAt: '2026-11-27T12:01:00.000Z',
        },
      ],
    };
    const view = buildProjectorViewModel(
      finishedSnapshot,
      null,
      Date.parse('2026-11-27T12:02:00.000Z'),
      'match',
    );

    expect(view.currentMatch).toMatchObject({
      id: 'match',
      status: 'FINISHED',
      homeScore: 12,
      awayScore: 7,
    });
    expect(view.availableViews).toContain('MATCH_PLATE');
  });

  it('omits a forced scorer view when there are no scorers and falls back to context', () => {
    const noScorersSnapshot = { ...snapshot, events: [] };
    const view = buildProjectorViewModel(
      noScorersSnapshot,
      { kind: 'SCORERS' },
      Date.parse('2026-11-27T12:02:00.000Z'),
    );

    expect(view.availableViews).not.toContain('SCORERS');
    expect(view.activeView).toBe('MATCH_PLATE');
  });

  it('prepares upcoming, standings, bracket, and scorer views when those data exist', () => {
    const pendingMatch: Match = {
      ...currentMatch,
      id: 'next',
      stageId: 'knockout',
      order: 2,
      status: 'PENDING',
      startedAt: null,
    };
    const tournamentSnapshot = {
      ...snapshot,
      stages: [
        ...snapshot.stages,
        { id: 'knockout', type: 'KNOCKOUT' as const, name: 'Final', order: 2, cup: null },
      ],
      matches: [...snapshot.matches, pendingMatch],
    };

    const view = buildProjectorViewModel(
      tournamentSnapshot,
      null,
      Date.parse('2026-11-27T12:02:00.000Z'),
    );

    expect(view.nextMatch?.id).toBe('next');
    expect(view.availableViews).toEqual(
      expect.arrayContaining(['NEXT_MATCH', 'SHORT_LIST', 'STANDINGS', 'BRACKET', 'SCORERS']),
    );
    expect(view.brackets[0]?.matches[0]?.id).toBe('next');
    expect(view.scorers[0]?.playerName).toBe('Ana Pérez (2)');
  });

  it('chooses a champion and runner-up from final standings when there is no knockout final', () => {
    const finishedSnapshot: TournamentSnapshot = {
      ...snapshot,
      tournament: { ...snapshot.tournament, status: 'FINISHED' },
      events: [],
      matches: [
        {
          ...currentMatch,
          status: 'FINISHED',
          result: {
            mode: 'DIRECT',
            homePoints: 15,
            awayPoints: 7,
            definition: 'REGULAR',
            winnerTeamId: null,
          },
          finishedAt: '2026-11-27T12:20:00.000Z',
        },
      ],
    };

    const view = buildProjectorViewModel(
      finishedSnapshot,
      null,
      Date.parse('2026-11-27T12:21:00.000Z'),
    );

    expect(view.activeView).toBe('FINAL_RESULT');
    expect(view.champion?.id).toBe('home');
    expect(view.runnerUp?.id).toBe('away');
  });
});
