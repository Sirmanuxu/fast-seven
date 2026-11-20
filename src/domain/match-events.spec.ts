import { describe, expect, it } from 'vitest';
import {
  computeScore,
  removeMatchEvent,
  canAddConversion,
  validateMatchEventPlayer,
} from './match-events';
import { MatchEvent, Player } from './model';

const homeTeamId = 'team-home';
const awayTeamId = 'team-away';

function event(
  id: string,
  teamId: string,
  type: MatchEvent['type'],
  playerId: string | null = null,
): MatchEvent {
  return {
    id,
    matchId: 'match-1',
    teamId,
    type,
    playerId,
    createdAt: '2026-11-20T12:00:00.000Z',
  };
}

describe('computeScore', () => {
  it.each([
    [3, 2, 19],
    [0, 0, 0],
    [1, 0, 5],
    [8, 0, 40],
  ])('computes %i tries and %i conversions as %i points', (tries, conversions, points) => {
    const events = [
      ...Array.from({ length: tries }, (_, index) => event(`try-${index}`, homeTeamId, 'TRY')),
      ...Array.from({ length: conversions }, (_, index) =>
        event(`conversion-${index}`, homeTeamId, 'CONVERSION'),
      ),
    ];

    expect(computeScore(events, homeTeamId, awayTeamId)).toEqual({
      ok: true,
      value: { home: points, away: 0 },
    });
  });

  it.each([
    [1, 2],
    [0, 1],
  ])('rejects %i tries and %i conversions', (tries, conversions) => {
    const events = [
      ...Array.from({ length: tries }, (_, index) => event(`try-${index}`, homeTeamId, 'TRY')),
      ...Array.from({ length: conversions }, (_, index) =>
        event(`conversion-${index}`, homeTeamId, 'CONVERSION'),
      ),
    ];

    expect(computeScore(events, homeTeamId, awayTeamId)).toMatchObject({
      ok: false,
      error: { code: 'conversionsExceedTries' },
    });
  });

  it('computes both teams independently', () => {
    const events = [
      event('home-try', homeTeamId, 'TRY'),
      event('home-conversion', homeTeamId, 'CONVERSION'),
      event('away-try', awayTeamId, 'TRY'),
    ];

    expect(computeScore(events, homeTeamId, awayTeamId)).toEqual({
      ok: true,
      value: { home: 7, away: 5 },
    });
  });
});

describe('match event actions', () => {
  it('rejects removing a try while its conversion remains', () => {
    const events = [
      event('try-1', homeTeamId, 'TRY'),
      event('try-2', homeTeamId, 'TRY'),
      event('conversion-1', homeTeamId, 'CONVERSION'),
      event('conversion-2', homeTeamId, 'CONVERSION'),
    ];

    expect(removeMatchEvent(events, 'try-1', homeTeamId, awayTeamId)).toMatchObject({
      ok: false,
      error: { code: 'removeTryFirst' },
    });
  });

  it('allows removing an event when the score remains valid', () => {
    const events = [
      event('try-1', homeTeamId, 'TRY'),
      event('conversion-1', homeTeamId, 'CONVERSION'),
    ];

    expect(removeMatchEvent(events, 'conversion-1', homeTeamId, awayTeamId)).toEqual({
      ok: true,
      value: [events[0]],
    });
  });

  it('disables conversions when no tries are available', () => {
    expect(canAddConversion([], homeTeamId)).toBe(false);
    expect(canAddConversion([event('try-1', homeTeamId, 'TRY')], homeTeamId)).toBe(true);
    expect(
      canAddConversion(
        [event('try-1', homeTeamId, 'TRY'), event('conversion-1', homeTeamId, 'CONVERSION')],
        homeTeamId,
      ),
    ).toBe(false);
  });

  it('accepts no author and rejects a player from another team', () => {
    const player: Player = {
      id: 'player-1',
      firstName: 'Ana',
      lastName: 'Rugby',
      category: 'M16',
      gender: 'F',
      teamId: homeTeamId,
      disambiguation: null,
      normalizedKey: 'ana|rugby|m16',
    };

    expect(validateMatchEventPlayer({ teamId: homeTeamId, playerId: null }, [player])).toEqual({
      ok: true,
      value: null,
    });
    expect(
      validateMatchEventPlayer({ teamId: awayTeamId, playerId: player.id }, [player]),
    ).toMatchObject({
      ok: false,
      error: { code: 'playerNotInTeam' },
    });
  });
});
