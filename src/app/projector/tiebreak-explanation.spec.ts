import { describe, expect, it } from 'vitest';
import { explainTiebreak } from './tiebreak-explanation';

describe('explainTiebreak', () => {
  it('includes the actual tied points and point-difference values', () => {
    const standings = {
      rows: [
        {
          row: {
            teamId: 'a',
            position: 1,
            tablePoints: 7,
            triesIncomplete: false,
            tiebreak: {
              criterion: 'POINT_DIFFERENCE' as const,
              comparedTeamIds: ['a', 'b'],
              values: { a: 12, b: 5 },
            },
          },
          team: { name: 'A' },
        },
        {
          row: {
            teamId: 'b',
            position: 2,
            tablePoints: 7,
            triesIncomplete: false,
            tiebreak: {
              criterion: 'POINT_DIFFERENCE' as const,
              comparedTeamIds: ['a', 'b'],
              values: { a: 12, b: 5 },
            },
          },
          team: { name: 'B' },
        },
      ],
    };

    expect(explainTiebreak(standings.rows[0], standings, 'Equipo a definir')).toBe(
      'Los equipos empataron en 7 puntos. Se aplicó el desempate por diferencia de puntos. Valores comparados: A: +12, B: +5.',
    );
  });

  it('warns when tries a favor are incomplete for the tied teams', () => {
    const standings = {
      rows: [
        {
          row: {
            teamId: 'a',
            position: 1,
            tablePoints: 7,
            triesIncomplete: true,
            tiebreak: {
              criterion: 'TRIES_FOR' as const,
              comparedTeamIds: ['a', 'b'],
              values: { a: 4, b: 3 },
            },
          },
          team: { name: 'A' },
        },
        {
          row: {
            teamId: 'b',
            position: 2,
            tablePoints: 7,
            triesIncomplete: false,
            tiebreak: {
              criterion: 'TRIES_FOR' as const,
              comparedTeamIds: ['a', 'b'],
              values: { a: 4, b: 3 },
            },
          },
          team: { name: 'B' },
        },
      ],
    };
    const firstTeam = standings.rows[0];
    if (!firstTeam) throw new Error('Expected the first standings row');

    expect(explainTiebreak(firstTeam, standings, 'Equipo a definir')).toContain(
      'Los partidos cargados con marcador directo no guardan el detalle de tries.',
    );
  });
});
