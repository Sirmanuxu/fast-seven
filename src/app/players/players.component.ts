import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tournamentRepository } from '../../data/tournament-repository';
import { Gender, Player, Team, Tournament } from '../../domain/model';
import { normalizePlayerKey, validatePlayerInput } from '../../domain/player';
import {
  capitalizeName,
  findNormalizedDuplicates,
  getNextHomonymDisambiguation,
} from '../../domain/player';
import { PLAYER_STRINGS } from '../../i18n/player-strings';

@Component({
  selector: 'app-players',
  templateUrl: './players.component.html',
  styleUrl: './players.component.css',
})
export class PlayersComponent implements OnInit {
  private readonly router = inject(Router);

  protected readonly strings = PLAYER_STRINGS;
  protected readonly players = signal<readonly Player[]>([]);
  protected readonly teams = signal<readonly Team[]>([]);
  protected readonly categories = signal<readonly string[]>([]);
  protected readonly tournament = signal<Tournament | null>(null);
  protected readonly search = signal('');
  protected readonly teamFilter = signal<string>('ALL');
  protected readonly categoryFilter = signal<string>('ALL');
  protected readonly genderFilter = signal<string>('ALL');

  protected readonly editingId = signal<string | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly category = signal('');
  protected readonly gender = signal<Gender | ''>('');
  private readonly teamId = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly statusMessage = signal<string | null>(null);
  protected readonly homonymOpen = signal(false);
  protected readonly duplicateCandidate = signal<Player | null>(null);
  protected readonly disambiguation = signal('');

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected get filteredPlayers(): readonly Player[] {
    const search = this.search().trim().toLocaleLowerCase('es');
    return this.players().filter((player) => {
      const matchesSearch =
        !search ||
        `${player.firstName} ${player.lastName}`.toLocaleLowerCase('es').includes(search);
      const matchesTeam =
        this.teamFilter() === 'ALL' ||
        (this.teamFilter() === 'UNASSIGNED'
          ? player.teamId === null
          : player.teamId === this.teamFilter());
      const matchesCategory =
        this.categoryFilter() === 'ALL' || player.category === this.categoryFilter();
      const matchesGender = this.genderFilter() === 'ALL' || player.gender === this.genderFilter();
      return matchesSearch && matchesTeam && matchesCategory && matchesGender;
    });
  }

  protected openAdd(): void {
    this.editingId.set(null);
    this.firstName.set('');
    this.lastName.set('');
    this.category.set(this.categories()[0] ?? '');
    this.gender.set('');
    this.teamId.set(null);
    this.formError.set(null);
    this.formOpen.set(true);
  }

  protected openEdit(player: Player): void {
    this.editingId.set(player.id);
    this.firstName.set(player.firstName);
    this.lastName.set(player.lastName);
    this.category.set(player.category);
    this.gender.set(player.gender);
    this.teamId.set(player.teamId);
    this.formError.set(null);
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.formError.set(null);
    this.homonymOpen.set(false);
    this.duplicateCandidate.set(null);
  }

  protected async savePlayer(): Promise<void> {
    const gender = this.gender();
    if (!gender) {
      this.formError.set(PLAYER_STRINGS.required);
      return;
    }

    const validation = validatePlayerInput(
      {
        firstName: this.firstName(),
        lastName: this.lastName(),
        category: this.category(),
        gender,
        teamId: this.teamId(),
      },
      this.players(),
      this.editingId(),
    );

    if (!validation.ok) {
      if (validation.error.code === 'DUPLICATE_PLAYER') {
        const candidate = validation.error.duplicate ?? null;
        if (candidate) {
          this.duplicateCandidate.set(candidate);
          const normalizedKey = normalizePlayerKey(
            capitalizeName(this.firstName()),
            capitalizeName(this.lastName()),
            this.category(),
          );
          this.disambiguation.set(getNextHomonymDisambiguation(normalizedKey, this.players()));
          this.homonymOpen.set(true);
          return;
        }
      }
      this.formError.set(
        validation.error.code === 'DUPLICATE_PLAYER'
          ? PLAYER_STRINGS.duplicate
          : validation.error.message,
      );
      return;
    }

    try {
      const existing = this.editingId()
        ? (this.players().find((player) => player.id === this.editingId()) ?? null)
        : null;
      const player: Player = {
        id: existing?.id ?? crypto.randomUUID(),
        firstName: validation.playerInput.firstName,
        lastName: validation.playerInput.lastName,
        category: validation.playerInput.category,
        gender: validation.playerInput.gender,
        teamId: validation.playerInput.teamId,
        disambiguation: existing?.disambiguation ?? null,
        normalizedKey: normalizePlayerKey(
          validation.playerInput.firstName,
          validation.playerInput.lastName,
          validation.playerInput.category,
        ),
      };
      await tournamentRepository.putPlayer(player, existing?.teamId ?? null);
      await this.load();
      this.closeForm();
      this.statusMessage.set(null);
    } catch {
      this.formError.set(PLAYER_STRINGS.saveFailed);
    }
  }

  protected async useSamePerson(): Promise<void> {
    const candidate = this.duplicateCandidate();
    if (!candidate) {
      return;
    }

    if (this.editingId()) {
      this.closeForm();
      this.statusMessage.set(PLAYER_STRINGS.samePersonDone);
      return;
    }

    const gender = this.gender();
    if (!gender) {
      this.formError.set(PLAYER_STRINGS.required);
      return;
    }

    const updated: Player = {
      ...candidate,
      firstName: capitalizeName(this.firstName()),
      lastName: capitalizeName(this.lastName()),
      category: this.category(),
      gender,
      normalizedKey: normalizePlayerKey(
        capitalizeName(this.firstName()),
        capitalizeName(this.lastName()),
        this.category(),
      ),
    };

    try {
      await tournamentRepository.putPlayer(updated, candidate.teamId);
      await this.load();
      this.closeForm();
      this.statusMessage.set(PLAYER_STRINGS.samePersonDone);
    } catch {
      this.formError.set(PLAYER_STRINGS.saveFailed);
    }
  }

  protected async saveDistinctPerson(): Promise<void> {
    const gender = this.gender();
    if (!gender) {
      this.formError.set(PLAYER_STRINGS.required);
      return;
    }

    const disambiguation = this.disambiguation().trim();
    if (!disambiguation) {
      this.formError.set('Ingresá una aclaración para distinguir al jugador.');
      return;
    }

    const normalizedKey = normalizePlayerKey(
      capitalizeName(this.firstName()),
      capitalizeName(this.lastName()),
      this.category(),
    );
    const duplicateCount = findNormalizedDuplicates(
      {
        firstName: capitalizeName(this.firstName()),
        lastName: capitalizeName(this.lastName()),
        category: this.category(),
      },
      this.players(),
      this.editingId(),
    ).length;
    if (duplicateCount === 0) {
      this.homonymOpen.set(false);
      await this.savePlayer();
      return;
    }

    const existing = this.editingId()
      ? (this.players().find((player) => player.id === this.editingId()) ?? null)
      : null;
    const player: Player = {
      id: existing?.id ?? crypto.randomUUID(),
      firstName: capitalizeName(this.firstName()),
      lastName: capitalizeName(this.lastName()),
      category: this.category(),
      gender,
      teamId: existing?.teamId ?? null,
      disambiguation: disambiguation.match(/^\(\d+\)$/)
        ? disambiguation
        : `(${disambiguation.replace(/[()]/g, '')})`,
      normalizedKey,
    };

    try {
      await tournamentRepository.putPlayer(player, existing?.teamId ?? null);
      await this.load();
      this.closeForm();
      this.statusMessage.set(PLAYER_STRINGS.distinctDone);
    } catch {
      this.formError.set(PLAYER_STRINGS.saveFailed);
    }
  }

  protected async deletePlayer(player: Player): Promise<void> {
    const confirmed = window.confirm(PLAYER_STRINGS.deleteQuestion);
    if (!confirmed) {
      return;
    }

    try {
      const captainCleared = await tournamentRepository.deletePlayer(player.id);
      await this.load();
      this.statusMessage.set(captainCleared ? PLAYER_STRINGS.captainCleared : null);
    } catch {
      this.statusMessage.set(PLAYER_STRINGS.deleteFailed);
    }
  }

  protected teamName(teamId: string | null): string {
    if (!teamId) {
      return PLAYER_STRINGS.withoutTeam;
    }
    return this.teams().find((team) => team.id === teamId)?.name ?? PLAYER_STRINGS.withoutTeam;
  }

  protected playerLabel(player: Player): string {
    return `${player.lastName}${player.disambiguation ?? ''}`;
  }

  protected goBack(): void {
    void this.router.navigateByUrl('/panel');
  }

  protected openImport(): void {
    void this.router.navigateByUrl('/panel/jugadores/importar');
  }

  private async load(): Promise<void> {
    this.tournament.set(await tournamentRepository.getTournament());
    this.categories.set(this.tournament()?.categories.map((category) => category.code) ?? []);
    this.players.set(await tournamentRepository.getPlayers());
    this.teams.set(await tournamentRepository.getTeams());
  }
}
