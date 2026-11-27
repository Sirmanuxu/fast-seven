import {
  ProjectorView,
  ProjectorViewKind,
  Match,
  ScorerRow,
  StandingsRow,
  Team,
  TournamentSnapshot,
} from '../../domain/model';
import { computeScore } from '../../domain/match-events';
import { buildMatchControlView } from '../../domain/match-control';
import { createSeededRng } from '../../domain/rng';
import { resolveMatches } from '../../domain/resolve-matches';
import { computeScheduleDetails } from '../../domain/schedule';
import { computeScorers } from '../../domain/scorers';
import { computeStandings } from '../../domain/standings';
import {
  computeFinalTournamentResult,
  FinalTeamPosition,
  FinalTournamentResult,
} from '../../domain/tournament-close';
import { PROJECTOR_STRINGS } from '../../i18n/projector-strings';

export interface ProjectorTeamCard {
  readonly team: Team;
  readonly textColor: '#000000' | '#ffffff';
}

export interface ProjectorMatchCard {
  readonly id: string;
  readonly label: string;
  readonly stageName: string;
  readonly groupName: string | null;
  readonly homeName: string;
  readonly awayName: string;
  readonly homeTeam: ProjectorTeamCard | null;
  readonly awayTeam: ProjectorTeamCard | null;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly status: 'PENDING' | 'IN_PROGRESS' | 'FINISHED';
  readonly estimatedStart: string | null;
  readonly lastTry: string | null;
}

export interface ProjectorStandingsRow {
  readonly row: StandingsRow;
  readonly team: Team | undefined;
  readonly tiebreakLabel: string | null;
}

export interface ProjectorStandingsView {
  readonly id: string;
  readonly title: string;
  readonly rows: readonly ProjectorStandingsRow[];
}

export interface ProjectorScorerRow {
  readonly row: ScorerRow;
  readonly playerName: string;
  readonly teamName: string;
}

export interface ProjectorBracketView {
  readonly id: string;
  readonly title: string;
  readonly matches: readonly ProjectorMatchCard[];
}

export interface ProjectorViewModel {
  readonly activeView: ProjectorViewKind;
  readonly availableViews: readonly ProjectorViewKind[];
  readonly teams: readonly ProjectorTeamCard[];
  readonly fixture: readonly ProjectorMatchCard[];
  readonly currentMatch: ProjectorMatchCard | null;
  readonly nextMatch: ProjectorMatchCard | null;
  readonly recentMatches: readonly ProjectorMatchCard[];
  readonly upcomingMatches: readonly ProjectorMatchCard[];
  readonly standings: readonly ProjectorStandingsView[];
  readonly brackets: readonly ProjectorBracketView[];
  readonly scorers: readonly ProjectorScorerRow[];
  readonly unattributedTries: number;
  readonly finalResult: FinalTournamentResult | null;
  readonly champion: Team | null;
  readonly runnerUp: Team | null;
  readonly finalPositions: readonly (FinalTeamPosition & { readonly team: Team | undefined })[];
}

export function getContrastingTextColor(background: string): '#000000' | '#ffffff' {
  const channels = /^#([0-9a-f]{6})$/i.exec(background)?.[1];
  if (!channels) return '#ffffff';
  const rgb = [0, 2, 4].map((offset) => Number.parseInt(channels.slice(offset, offset + 2), 16));
  const luminance = rgb
    .map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const whiteContrast = 1.05 / (luminance + 0.05);
  const blackContrast = (luminance + 0.05) / 0.05;
  return blackContrast >= whiteContrast ? '#000000' : '#ffffff';
}

export function getTiebreakLabel(criterion: string): string {
  return (
    Object.entries(PROJECTOR_STRINGS.tiebreakers).find(([key]) => key === criterion)?.[1] ??
    criterion
  );
}

function formatTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function playerName(snapshot: TournamentSnapshot, playerId: string | null): string {
  if (!playerId) return PROJECTOR_STRINGS.unassignedPlayer;
  const player = snapshot.players.find((candidate) => candidate.id === playerId);
  if (!player) return PROJECTOR_STRINGS.unassignedPlayer;
  return [player.firstName, player.lastName, player.disambiguation]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(' ');
}

function defaultView(
  snapshot: TournamentSnapshot | null,
  currentMatch: ProjectorMatchCard | null,
): ProjectorViewKind {
  if (!snapshot) return 'TEAMS_AND_FIXTURE';
  if (snapshot.tournament.status === 'FINISHED') return 'FINAL_RESULT';
  if (snapshot.tournament.status === 'RUNNING') {
    return currentMatch ? 'MATCH_PLATE' : 'NEXT_MATCH';
  }
  return 'TEAMS_AND_FIXTURE';
}

function viewIsAvailable(
  view: ProjectorViewKind,
  snapshot: TournamentSnapshot | null,
  values: Pick<
    ProjectorViewModel,
    | 'teams'
    | 'fixture'
    | 'currentMatch'
    | 'nextMatch'
    | 'recentMatches'
    | 'upcomingMatches'
    | 'standings'
    | 'brackets'
    | 'scorers'
    | 'unattributedTries'
    | 'finalPositions'
  >,
): boolean {
  switch (view) {
    case 'TEAMS_AND_FIXTURE':
      return values.teams.length > 0;
    case 'MATCH_PLATE':
      return values.currentMatch !== null;
    case 'NEXT_MATCH':
      return values.nextMatch !== null;
    case 'SHORT_LIST':
      return (
        values.recentMatches.length > 0 ||
        values.currentMatch !== null ||
        values.upcomingMatches.length > 0
      );
    case 'STANDINGS':
      return values.standings.length > 0;
    case 'BRACKET':
      return values.brackets.length > 0;
    case 'SCORERS':
      return values.scorers.length > 0 || values.unattributedTries > 0;
    case 'FINAL_RESULT':
    case 'FINAL_STANDINGS':
      return snapshot?.tournament.status === 'FINISHED' && values.finalPositions.length > 0;
  }
}

export function buildProjectorViewModel(
  snapshot: TournamentSnapshot | null,
  forcedView: ProjectorView | null,
  nowEpochMs: number,
  highlightedMatchId: string | null = null,
): ProjectorViewModel {
  const empty: ProjectorViewModel = {
    activeView: 'TEAMS_AND_FIXTURE',
    availableViews: [],
    teams: [],
    fixture: [],
    currentMatch: null,
    nextMatch: null,
    recentMatches: [],
    upcomingMatches: [],
    standings: [],
    brackets: [],
    scorers: [],
    unattributedTries: 0,
    finalResult: null,
    champion: null,
    runnerUp: null,
    finalPositions: [],
  };
  if (!snapshot) return empty;

  const teamsById = new Map(snapshot.teams.map((team) => [team.id, team]));
  const teamCards = new Map(
    snapshot.teams.map((team) => [
      team.id,
      {
        team,
        textColor: getContrastingTextColor(team.primaryColor),
      },
    ]),
  );
  const rng = createSeededRng(
    snapshot.draws.find((draw) => draw.payload.kind === 'TIEBREAK')?.seed ?? 'projector-view',
  );
  const resolvedMatches = resolveMatches(snapshot, rng);
  const resolvedById = new Map(resolvedMatches.map((match) => [match.matchId, match]));
  const schedule = computeScheduleDetails(snapshot, nowEpochMs, resolvedMatches, 'PERSISTED');
  const scheduleById = new Map(
    schedule.entries.map((entry) => [entry.matchId, entry.estimatedStart]),
  );
  const matchById = new Map(snapshot.matches.map((match) => [match.id, match]));
  const orderById = new Map(schedule.orderedMatchIds.map((id, index) => [id, index]));

  const fixture = snapshot.matches
    .filter(
      (match) =>
        !match.isConditional &&
        (!match.isPhantom ||
          (snapshot.stages.find((stage) => stage.id === match.stageId)?.type === 'SWISS' &&
            match.home.kind === 'TEAM' &&
            match.away.kind === 'BYE')),
    )
    .map((match): ProjectorMatchCard => {
      const resolved = resolvedById.get(match.id);
      const homeTeam = resolved?.homeTeamId ? (teamCards.get(resolved.homeTeamId) ?? null) : null;
      const awayTeam = resolved?.awayTeamId ? (teamCards.get(resolved.awayTeamId) ?? null) : null;
      const isSwissBye = match.isPhantom && match.home.kind === 'TEAM' && match.away.kind === 'BYE';
      let score: { readonly home: number; readonly away: number } | null = null;
      if (match.status === 'IN_PROGRESS' && homeTeam && awayTeam) {
        const scoreResult = computeScore(
          snapshot.events.filter((event) => event.matchId === match.id),
          homeTeam.team.id,
          awayTeam.team.id,
        );
        if (scoreResult.ok) score = scoreResult.value;
      } else if (match.result && !isSwissBye) {
        score = { home: match.result.homePoints, away: match.result.awayPoints };
      }

      const lastTryEvent = snapshot.events
        .filter((event) => event.matchId === match.id && event.type === 'TRY')
        .reduce<
          (typeof snapshot.events)[number] | null
        >((latest, event) => (!latest || event.createdAt.localeCompare(latest.createdAt) >= 0 ? event : latest), null);
      const lastTryTeam = lastTryEvent ? teamsById.get(lastTryEvent.teamId)?.name : undefined;
      const lastTry =
        lastTryEvent && lastTryTeam
          ? `${lastTryTeam} · ${playerName(snapshot, lastTryEvent.playerId)}`
          : null;

      return {
        id: match.id,
        label: match.label ?? `${PROJECTOR_STRINGS.matchPrefix} ${match.order}`,
        stageName: snapshot.stages.find((stage) => stage.id === match.stageId)?.name ?? '',
        groupName: snapshot.groups.find((group) => group.id === match.groupId)?.name ?? null,
        homeName: resolved?.homeLabel ?? PROJECTOR_STRINGS.toBeDefined,
        awayName:
          match.away.kind === 'BYE'
            ? PROJECTOR_STRINGS.bye
            : (resolved?.awayLabel ?? PROJECTOR_STRINGS.toBeDefined),
        homeTeam,
        awayTeam,
        homeScore: score?.home ?? null,
        awayScore: score?.away ?? null,
        status: match.status,
        estimatedStart: formatTime(scheduleById.get(match.id) ?? null),
        lastTry,
      };
    })
    .sort((left, right) => {
      const leftMatch = matchById.get(left.id);
      const rightMatch = matchById.get(right.id);
      return (leftMatch?.order ?? 0) - (rightMatch?.order ?? 0);
    });

  const currentMatch =
    fixture.find((match) => match.status === 'IN_PROGRESS') ??
    (highlightedMatchId
      ? (fixture.find((match) => match.id === highlightedMatchId && match.status === 'FINISHED') ??
        null)
      : null);
  const upcomingMatches = [...fixture]
    .filter(
      (match) =>
        match.status === 'PENDING' &&
        resolvedById.get(match.id)?.isPlayable &&
        !matchById.get(match.id)?.isPhantom,
    )
    .sort(
      (left, right) =>
        (orderById.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (orderById.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(0, 5);
  const control = buildMatchControlView(snapshot, resolvedMatches, schedule.orderedMatchIds);
  const nextMatch = control.next
    ? (fixture.find((match) => match.id === control.next?.match.id) ?? null)
    : (upcomingMatches[0] ?? null);
  const recentMatches = [...fixture]
    .filter((match) => match.status === 'FINISHED')
    .sort((left, right) => {
      const leftDate = matchById.get(left.id)?.finishedAt ?? '';
      const rightDate = matchById.get(right.id)?.finishedAt ?? '';
      return rightDate.localeCompare(leftDate) || right.id.localeCompare(left.id);
    })
    .slice(0, 3);

  const standingsScopes: {
    readonly id: string;
    readonly title: string;
    readonly teamIds: readonly string[];
    readonly matches: readonly Match[];
  }[] = snapshot.groups
    .filter((group) => group.teamIds.length > 0)
    .sort((left, right) => {
      const leftStageOrder = snapshot.stages.find((stage) => stage.id === left.stageId)?.order ?? 0;
      const rightStageOrder =
        snapshot.stages.find((stage) => stage.id === right.stageId)?.order ?? 0;
      return leftStageOrder - rightStageOrder || left.name.localeCompare(right.name, 'es');
    })
    .map((group) => ({
      id: group.id,
      title: `${PROJECTOR_STRINGS.groupPrefix} ${group.name}`,
      teamIds: group.teamIds,
      matches: snapshot.matches.filter(
        (match) => match.stageId === group.stageId && match.groupId === group.id,
      ),
    }));
  if (standingsScopes.length === 0) {
    const standingsStages = snapshot.stages.filter(
      (stage) => stage.type === 'LEAGUE' || stage.type === 'SWISS',
    );
    for (const stage of standingsStages) {
      standingsScopes.push({
        id: stage.id,
        title: stage.name,
        teamIds: snapshot.teams.filter((team) => team.status === 'ACTIVE').map((team) => team.id),
        matches: snapshot.matches.filter((match) => match.stageId === stage.id),
      });
    }
    if (standingsScopes.length === 0 && snapshot.teams.some((team) => team.status === 'ACTIVE')) {
      standingsScopes.push({
        id: 'all-teams',
        title: PROJECTOR_STRINGS.generalStandingsTitle,
        teamIds: snapshot.teams.filter((team) => team.status === 'ACTIVE').map((team) => team.id),
        matches: snapshot.matches,
      });
    }
  }

  const standings = standingsScopes.map((scope): ProjectorStandingsView => {
    const result = computeStandings({
      teamIds: scope.teamIds,
      teams: snapshot.teams,
      matches: scope.matches,
      events: snapshot.events,
      rules: snapshot.tournament.rules,
      draws: snapshot.draws,
      rng: createSeededRng(`projector-${scope.id}`),
    });
    return {
      id: scope.id,
      title: scope.title,
      rows: result.rows.map((row) => ({
        row,
        team: teamsById.get(row.teamId),
        tiebreakLabel: row.tiebreak ? PROJECTOR_STRINGS.tiebreakers[row.tiebreak.criterion] : null,
      })),
    };
  });

  const bracketStages = snapshot.stages
    .filter((stage) =>
      [
        'KNOCKOUT',
        'CUP',
        'WINNERS_BRACKET',
        'LOSERS_BRACKET',
        'GRAND_FINAL',
        'POSITION_PLAYOFFS',
      ].includes(stage.type),
    )
    .sort((left, right) => left.order - right.order)
    .map((stage) => ({
      id: stage.id,
      title: stage.name,
      matches: fixture
        .filter((match) => matchById.get(match.id)?.stageId === stage.id)
        .sort((left, right) => {
          const leftMatch = matchById.get(left.id);
          const rightMatch = matchById.get(right.id);
          return (
            (leftMatch?.round ?? 0) - (rightMatch?.round ?? 0) ||
            (leftMatch?.order ?? 0) - (rightMatch?.order ?? 0)
          );
        }),
    }))
    .filter((stage) => stage.matches.length > 0);

  const scorerResult = computeScorers({
    players: snapshot.players,
    matches: snapshot.matches,
    events: snapshot.events,
  });
  const scorers = scorerResult.rows.slice(0, 10).map((row): ProjectorScorerRow => {
    const player = snapshot.players.find((candidate) => candidate.id === row.playerId);
    const team = row.teamId ? teamsById.get(row.teamId) : undefined;
    return {
      row,
      playerName: player ? playerName(snapshot, player.id) : PROJECTOR_STRINGS.unknownPlayer,
      teamName: team?.name ?? PROJECTOR_STRINGS.unassignedTeam,
    };
  });

  const finalResult =
    snapshot.tournament.status === 'FINISHED' ? computeFinalTournamentResult(snapshot) : null;
  const finalPositions =
    finalResult?.positions.map((position) => ({
      ...position,
      team: teamsById.get(position.teamId),
    })) ?? [];
  const activeTeamCards = snapshot.teams
    .filter((team) => team.status === 'ACTIVE')
    .map((team) => teamCards.get(team.id))
    .filter((team): team is ProjectorTeamCard => team !== undefined);
  const interim: ProjectorViewModel = {
    activeView: 'TEAMS_AND_FIXTURE',
    availableViews: [],
    teams: activeTeamCards,
    fixture,
    currentMatch,
    nextMatch,
    recentMatches,
    upcomingMatches,
    standings,
    brackets: bracketStages,
    scorers,
    unattributedTries: scorerResult.unattributedTries,
    finalResult,
    champion: finalResult?.championTeamId
      ? (teamsById.get(finalResult.championTeamId) ?? null)
      : (finalPositions[0]?.team ?? null),
    runnerUp: finalResult?.runnerUpTeamId
      ? (teamsById.get(finalResult.runnerUpTeamId) ?? null)
      : (finalPositions[1]?.team ?? null),
    finalPositions,
  };

  const candidates: readonly ProjectorViewKind[] = [
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
  const availableViews = candidates.filter((view) => viewIsAvailable(view, snapshot, interim));
  const preferredView = forcedView?.kind ?? defaultView(snapshot, currentMatch);
  const fallbackView = defaultView(snapshot, currentMatch);
  const activeView = availableViews.includes(preferredView)
    ? preferredView
    : availableViews.includes(fallbackView)
      ? fallbackView
      : (availableViews[0] ?? 'TEAMS_AND_FIXTURE');

  return { ...interim, activeView, availableViews };
}
