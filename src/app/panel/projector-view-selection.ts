import type { ProjectorContext } from '../../domain/projector-context';
import type { ProjectorView, ProjectorViewKind, TournamentSnapshot } from '../../domain/model';
import { PROJECTOR_PANEL_STRINGS } from '../../i18n/projector-panel-strings';

export interface ProjectorViewScope {
  readonly id: string;
  readonly title: string;
}

export interface ProjectorViewSelectionData {
  readonly availableViews: readonly ProjectorViewKind[];
  readonly standings: readonly ProjectorViewScope[];
  readonly brackets: readonly ProjectorViewScope[];
}

const PROJECTOR_VIEW_KINDS: readonly ProjectorViewKind[] = [
  'TEAMS_AND_FIXTURE',
  'MATCH_PLATE',
  'NEXT_MATCH',
  'SHORT_LIST',
  'STANDINGS',
  'BRACKET',
  'SCORERS',
  'FINAL_RESULT',
  'FINAL_STANDINGS',
];

export function buildProjectorViewSelectionData(
  snapshot: TournamentSnapshot | null,
  context: ProjectorContext,
  hasNextMatch: boolean,
  hasFinalPositions: boolean,
): ProjectorViewSelectionData {
  if (!snapshot) return { availableViews: [], standings: [], brackets: [] };

  const groupedStandings = snapshot.groups
    .filter((group) => group.teamIds.length > 0)
    .sort((left, right) => {
      const leftOrder = snapshot.stages.find((stage) => stage.id === left.stageId)?.order ?? 0;
      const rightOrder = snapshot.stages.find((stage) => stage.id === right.stageId)?.order ?? 0;
      return leftOrder - rightOrder || left.name.localeCompare(right.name, 'es');
    })
    .map((group) => ({
      id: group.id,
      title: `${PROJECTOR_PANEL_STRINGS.groupPrefix} ${group.name}`,
    }));
  const standings =
    groupedStandings.length > 0
      ? groupedStandings
      : snapshot.stages
            .filter((stage) => stage.type === 'LEAGUE' || stage.type === 'SWISS')
            .map((stage) => ({ id: stage.id, title: stage.name }));
  const allStandings =
    standings.length > 0
      ? standings
      : snapshot.teams.some((team) => team.status === 'ACTIVE')
        ? [{ id: 'all-teams', title: PROJECTOR_PANEL_STRINGS.generalStandingsTitle }]
        : [];
  const bracketTypes: readonly string[] = [
    'KNOCKOUT',
    'CUP',
    'WINNERS_BRACKET',
    'LOSERS_BRACKET',
    'GRAND_FINAL',
    'POSITION_PLAYOFFS',
  ];
  const brackets = snapshot.stages
    .filter(
      (stage) =>
        bracketTypes.includes(stage.type) &&
        snapshot.matches.some(
          (match) =>
            match.stageId === stage.id && !match.isPhantom && !match.isConditional,
        ),
    )
    .sort((left, right) => left.order - right.order)
    .map((stage) => ({ id: stage.id, title: stage.name }));
  const activeTeams = snapshot.teams.some((team) => team.status === 'ACTIVE');
  const hasRecentMatches = snapshot.matches.some(
    (match) =>
      !match.isPhantom &&
      !match.isConditional &&
      (match.status === 'IN_PROGRESS' || match.status === 'FINISHED'),
  );
  const views: ProjectorViewKind[] = [];

  if (activeTeams) views.push('TEAMS_AND_FIXTURE');
  if (context === 'MATCH_IN_PROGRESS' || context === 'RECENT_RESULT') {
    views.push('MATCH_PLATE');
  }
  if (hasNextMatch) views.push('NEXT_MATCH');
  if (hasRecentMatches || hasNextMatch) views.push('SHORT_LIST');
  if (allStandings.length > 0) views.push('STANDINGS');
  if (brackets.length > 0) views.push('BRACKET');
  if (snapshot.events.some((event) => event.type === 'TRY')) views.push('SCORERS');
  if (snapshot.tournament.status === 'FINISHED' && hasFinalPositions) {
    views.push('FINAL_RESULT', 'FINAL_STANDINGS');
  }

  return { availableViews: views, standings: allStandings, brackets };
}

export function isProjectorViewKind(value: string): value is ProjectorViewKind {
  return PROJECTOR_VIEW_KINDS.some((kind) => kind === value);
}

export function createForcedProjectorView(
  kind: ProjectorViewKind,
  data: ProjectorViewSelectionData,
): ProjectorView | null {
  if (!data.availableViews.includes(kind)) return null;
  if (kind === 'STANDINGS') {
    const firstStanding = data.standings[0];
    return firstStanding ? { kind, groupId: firstStanding.id } : null;
  }
  if (kind === 'BRACKET') {
    const firstBracket = data.brackets[0];
    return firstBracket ? { kind, stageId: firstBracket.id } : null;
  }
  return { kind };
}

export function isForcedProjectorViewAvailable(
  view: ProjectorView,
  data: ProjectorViewSelectionData,
): boolean {
  if (!data.availableViews.includes(view.kind)) return false;
  if (view.kind === 'STANDINGS' && view.groupId !== undefined) {
    return data.standings.some((standing) => standing.id === view.groupId);
  }
  if (view.kind === 'BRACKET' && view.stageId !== undefined) {
    return data.brackets.some((bracket) => bracket.id === view.stageId);
  }
  return true;
}
