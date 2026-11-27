import type { StandingsRow, Team } from '../../domain/model';
import { EXPLANATION_STRINGS } from '../../i18n/explanations-strings';

type TiebreakRow = Pick<
  StandingsRow,
  'teamId' | 'position' | 'tablePoints' | 'triesIncomplete' | 'tiebreak'
>;

interface TiebreakEntry {
  readonly row: TiebreakRow;
  readonly team: Pick<Team, 'name'> | undefined;
}

interface TiebreakStandings {
  readonly rows: readonly TiebreakEntry[];
}

export function explainTiebreak(
  entry: TiebreakEntry,
  standings: TiebreakStandings,
  unknownTeamLabel: string,
): string {
  const tieBreak = entry.row.tiebreak;
  if (!tieBreak) return '';

  const criterion = EXPLANATION_STRINGS.tiebreak.criterionLabels[tieBreak.criterion];
  const why = EXPLANATION_STRINGS.tiebreak.why(entry.row.tablePoints, criterion);
  const comparedTeams = standings.rows
    .filter((candidate) => tieBreak.comparedTeamIds.includes(candidate.row.teamId))
    .sort((left, right) => left.row.position - right.row.position);

  if (!tieBreak.values) {
    const teams = comparedTeams
      .map((candidate) => `${candidate.row.position}° ${candidate.team?.name ?? unknownTeamLabel}`)
      .join(', ');
    return `${why} ${EXPLANATION_STRINGS.tiebreak.draw(teams)}`;
  }

  const values = comparedTeams
    .map((candidate) => {
      const value = tieBreak.values?.[candidate.row.teamId] ?? 0;
      const formatted =
        tieBreak.criterion === 'POINT_DIFFERENCE' && value >= 0 ? `+${value}` : String(value);
      return `${candidate.team?.name ?? unknownTeamLabel}: ${formatted}`;
    })
    .join(', ');
  const triesIncomplete = comparedTeams.some((candidate) => candidate.row.triesIncomplete)
    ? ` ${EXPLANATION_STRINGS.triesIncomplete}`
    : '';
  return `${why} ${EXPLANATION_STRINGS.tiebreak.values(values)}${triesIncomplete}`;
}
