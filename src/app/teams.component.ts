import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tournamentRepository } from '../data/tournament-repository';
import { Player, Team, Tournament } from '../domain/model';
import {
  areTeamColorsTooSimilar,
  canCreateOrDeleteTeam,
  getRosterStatus,
  hasMixedRoster,
  validateTeamInput,
} from '../domain/team';
import { TEAM_STRINGS } from '../i18n/team-strings';

@Component({
  selector: 'app-teams',
  templateUrl: './teams.component.html',
  styleUrl: './teams.component.css',
})
export class TeamsComponent implements OnInit {
  private readonly router = inject(Router);

  protected readonly strings = TEAM_STRINGS;
  protected readonly teams = signal<readonly Team[]>([]);
  protected readonly players = signal<readonly Player[]>([]);
  protected readonly tournament = signal<Tournament | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly name = signal('');
  protected readonly primaryColor = signal('#1f4b99');
  protected readonly secondaryColor = signal('#f1c40f');
  protected readonly captainId = signal<string | null>(null);
  protected readonly isSeed = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly statusMessage = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.tournament.set(await tournamentRepository.getTournament());
    this.teams.set(await tournamentRepository.getTeams());
    this.players.set(await tournamentRepository.getPlayers());
  }

  protected get canCreateOrDelete(): boolean {
    return this.tournament() ? canCreateOrDeleteTeam(this.tournament()?.status ?? 'SETUP') : false;
  }

  protected openAdd(): void {
    if (!this.canCreateOrDelete) {
      this.statusMessage.set(TEAM_STRINGS.runningCreateDelete);
      return;
    }
    this.editingId.set(null);
    this.name.set('');
    this.primaryColor.set('#1f4b99');
    this.secondaryColor.set('#f1c40f');
    this.captainId.set(null);
    this.isSeed.set(false);
    this.formError.set(null);
    this.formOpen.set(true);
  }

  protected openEdit(team: Team): void {
    this.editingId.set(team.id);
    this.name.set(team.name);
    this.primaryColor.set(team.primaryColor);
    this.secondaryColor.set(team.secondaryColor);
    this.captainId.set(team.captainId);
    this.isSeed.set(team.isSeed);
    this.formError.set(null);
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.formError.set(null);
  }

  protected async saveTeam(): Promise<void> {
    const existing = this.editingId()
      ? (this.teams().find((team) => team.id === this.editingId()) ?? null)
      : null;

    const validation = validateTeamInput({
      name: this.name(),
      primaryColor: this.primaryColor(),
      secondaryColor: this.secondaryColor(),
      captainId: this.captainId(),
      teamId: existing?.id ?? null,
      players: this.players(),
      teams: this.teams(),
    });
    if (!validation.ok) {
      this.formError.set(validation.error.message);
      return;
    }

    if (!existing && !this.canCreateOrDelete) {
      this.formError.set(TEAM_STRINGS.runningCreateDelete);
      return;
    }

    const team: Team = {
      id: existing?.id ?? crypto.randomUUID(),
      name: validation.name,
      primaryColor: this.primaryColor(),
      secondaryColor: this.secondaryColor(),
      captainId: this.captainId(),
      logo: existing?.logo ?? null,
      isSeed: this.isSeed(),
      status: existing?.status ?? 'ACTIVE',
    };

    try {
      await tournamentRepository.putTeam(team);
      await this.load();
      this.closeForm();
      this.statusMessage.set(null);
    } catch {
      this.formError.set(TEAM_STRINGS.saveFailed);
    }
  }

  protected async deleteTeam(team: Team): Promise<void> {
    if (!this.canCreateOrDelete) {
      this.statusMessage.set(TEAM_STRINGS.runningCreateDelete);
      return;
    }

    const fixtureWarning =
      this.tournament()?.status === 'FIXTURE_GENERATED' ? ` ${TEAM_STRINGS.fixtureDelete}` : '';
    const confirmed = window.confirm(`${TEAM_STRINGS.deleteQuestion}${fixtureWarning}`);
    if (!confirmed) {
      return;
    }

    try {
      await tournamentRepository.deleteTeam(team.id);
      await this.load();
      this.statusMessage.set(
        this.tournament()?.status === 'FIXTURE_GENERATED' ? TEAM_STRINGS.fixtureDelete : null,
      );
    } catch {
      this.statusMessage.set(TEAM_STRINGS.deleteFailed);
    }
  }

  protected rosterStatus(team: Team): string {
    const limits = this.tournament()?.rules.roster;
    if (!limits) {
      return '';
    }
    const status = getRosterStatus(this.players(), team.id, limits);
    if (status.state === 'BELOW_MINIMUM') {
      return `${status.count} ${TEAM_STRINGS.players}: ${TEAM_STRINGS.belowMinimum}`;
    }
    if (status.state === 'ABOVE_MAXIMUM') {
      return `${status.count} ${TEAM_STRINGS.players}: ${TEAM_STRINGS.aboveMaximum}`;
    }
    return `${status.count} ${TEAM_STRINGS.players}: ${TEAM_STRINGS.rosterOk}`;
  }

  protected rosterLabel(team: Team): 'rojo' | 'amarillo' | 'verde' {
    const limits = this.tournament()?.rules.roster;
    return limits ? getRosterStatus(this.players(), team.id, limits).label : 'verde';
  }

  protected teamPlayers(team: Team): readonly Player[] {
    return this.players().filter((player) => player.teamId === team.id);
  }

  protected captainOptions(teamId: string | null): readonly Player[] {
    return teamId ? this.players().filter((player) => player.teamId === teamId) : [];
  }

  protected isMixed(team: Team): boolean {
    return hasMixedRoster(this.players(), team.id);
  }

  protected colorsWarning(): boolean {
    return areTeamColorsTooSimilar(this.primaryColor(), this.secondaryColor());
  }

  protected playerName(player: Player): string {
    return `${player.firstName} ${player.lastName}${player.disambiguation ?? ''}`;
  }

  protected captainName(team: Team): string {
    if (!team.captainId) {
      return TEAM_STRINGS.noCaptain;
    }
    const captain = this.teamPlayers(team).find((player) => player.id === team.captainId);
    return captain ? this.playerName(captain) : TEAM_STRINGS.noCaptain;
  }

  protected goBack(): void {
    void this.router.navigateByUrl('/panel');
  }
}
