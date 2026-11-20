import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  DEFAULT_TIEBREAKERS,
  PRESET_POINTS_3_2_1,
  PRESET_POINTS_4_2_0_BONUS,
  PointsRules,
  ScheduleConfig,
  Tiebreaker,
  Tournament,
  TournamentRules,
} from '../../domain/model';
import { tournamentRepository } from '../../data/tournament-repository';
import { RULES_STRINGS } from '../../i18n/rules-strings';
import { showErrorPopup } from '../error-popup';

type Preset = '3_2_1' | '4_2_0' | 'CUSTOM';

@Component({
  selector: 'app-rules',
  templateUrl: './rules.component.html',
  styleUrl: './rules.component.css',
})
export class RulesComponent implements OnInit {
  protected readonly strings = RULES_STRINGS;
  protected readonly tournament = signal<Tournament | null>(null);
  protected readonly statusMessage = signal<string | null>(null);
  protected readonly recalculationWarning = signal(false);
  protected readonly pointsWarning = signal(false);
  protected readonly isSaving = signal(false);
  protected readonly name = signal('');
  protected readonly date = signal('');
  protected readonly preset = signal<Preset>('3_2_1');
  protected readonly points = signal<PointsRules>(PRESET_POINTS_3_2_1);
  protected readonly tiebreakers = signal<readonly Tiebreaker[]>(DEFAULT_TIEBREAKERS);
  protected readonly winnerScore = signal(28);
  protected readonly loserScore = signal(0);
  protected readonly byeWinPoints = signal(true);
  protected readonly byeScore = signal(false);
  protected readonly rosterMin = signal(7);
  protected readonly rosterMax = signal<number | null>(12);
  protected readonly startTime = signal('');
  protected readonly matchDuration = signal(40);
  protected readonly rest = signal(10);

  private readonly router = inject(Router);

  async ngOnInit(): Promise<void> {
    const tournament = await tournamentRepository.getTournament();
    this.tournament.set(tournament);
    if (!tournament) {
      await this.router.navigateByUrl('/bienvenida');
      return;
    }

    this.name.set(tournament.name);
    this.date.set(tournament.date.slice(0, 10));
    this.points.set(tournament.rules.points);
    this.preset.set(this.detectPreset(tournament.rules.points));
    this.tiebreakers.set(tournament.rules.tiebreakers.filter((value) => value !== 'DRAW'));
    this.winnerScore.set(tournament.rules.walkoverScore.winner);
    this.loserScore.set(tournament.rules.walkoverScore.loser);
    this.byeWinPoints.set(tournament.rules.bye.awardsWinPoints);
    this.byeScore.set(tournament.rules.bye.countsScore);
    this.rosterMin.set(tournament.rules.roster.min);
    this.rosterMax.set(tournament.rules.roster.max);
    this.startTime.set(tournament.schedule.startTime?.slice(11, 16) ?? '');
    this.matchDuration.set(tournament.schedule.matchDurationMin);
    this.rest.set(tournament.schedule.restMin);
  }

  protected setName(value: string): void {
    this.name.set(value);
  }

  protected setDate(value: string): void {
    this.date.set(value);
  }

  protected setPreset(value: Preset): void {
    this.preset.set(value);
    if (value === '3_2_1') this.points.set(PRESET_POINTS_3_2_1);
    if (value === '4_2_0') this.points.set(PRESET_POINTS_4_2_0_BONUS);
  }

  protected updatePoint(field: keyof Omit<PointsRules, 'bonus'>, value: string): void {
    this.preset.set('CUSTOM');
    this.points.set({ ...this.points(), [field]: this.toInteger(value) });
  }

  protected updateBonus(
    field: keyof PointsRules['bonus'],
    value: string,
  ): void {
    this.preset.set('CUSTOM');
    const number =
      value === ''
        ? field === 'triesThreshold' || field === 'losingMarginMax'
          ? null
          : -1
        : this.toInteger(value);
    this.points.set({
      ...this.points(),
      bonus: {
        ...this.points().bonus,
        [field]: number,
      },
    });
  }

  protected setTiebreaker(index: number, event: Event): void {
    const value = (event.target as HTMLSelectElement).value as Tiebreaker;
    const next = [...this.tiebreakers()];
    const previousIndex = next.indexOf(value);
    if (previousIndex >= 0 && previousIndex !== index) {
      [next[index], next[previousIndex]] = [next[previousIndex], next[index]];
      this.tiebreakers.set(next);
      return;
    }
    next[index] = value;
    this.tiebreakers.set(next);
  }

  protected moveTiebreaker(index: number, direction: -1 | 1): void {
    const next = [...this.tiebreakers()];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    this.tiebreakers.set(next);
  }

  protected tiebreakerLabel(value: Tiebreaker): string {
    return {
      HEAD_TO_HEAD: this.strings.headToHead,
      POINT_DIFFERENCE: this.strings.pointDifference,
      POINTS_FOR: this.strings.pointsFor,
      TRIES_FOR: this.strings.triesFor,
      BUCHHOLZ: this.strings.buchholz,
      DRAW: this.strings.drawCriterion,
    }[value];
  }

  protected updateNumber(field: 'winnerScore' | 'loserScore' | 'rosterMin' | 'matchDuration' | 'rest', value: string): void {
    this[field].set(this.toInteger(value) as never);
  }

  protected updateRosterMax(value: string): void {
    this.rosterMax.set(value === '' ? null : this.toInteger(value));
  }

  protected async save(): Promise<void> {
    const tournament = this.tournament();
    const rules = this.buildRules();
    if (!tournament || !this.name().trim() || !this.date() || !rules || this.matchDuration() < 0 || this.rest() < 0) {
      showErrorPopup(
        !this.name().trim()
          ? this.strings.nameRequired
          : !this.date()
            ? this.strings.dateRequired
            : this.strings.integerRequired,
      );
      return;
    }
    if (this.rosterMax() !== null && this.rosterMin() > this.rosterMax()!) {
      showErrorPopup(this.strings.rosterOrder);
      return;
    }

    this.isSaving.set(true);
    const schedule: ScheduleConfig = {
      startTime: this.startTime() ? `${this.date()}T${this.startTime()}:00` : null,
      matchDurationMin: this.matchDuration(),
      restMin: this.rest(),
      breaks: tournament.schedule.breaks,
    };
    try {
      await tournamentRepository.updateTournamentConfiguration({
        name: this.name().trim(),
        date: `${this.date()}T00:00:00.000Z`,
        rules,
        schedule,
      });
      this.statusMessage.set(
        tournament.status === 'RUNNING' && this.recalculationWarning()
          ? this.strings.runningSaved
          : this.strings.saved,
      );
      await this.router.navigateByUrl('/panel');
    } catch {
      showErrorPopup(this.strings.saveFailed);
    } finally {
      this.isSaving.set(false);
    }
  }

  protected goBack(): void {
    void this.router.navigateByUrl('/panel');
  }

  protected isSwiss(): boolean {
    return this.tournament()?.formatParams?.format === 'SWISS';
  }

  private buildRules(): TournamentRules | null {
    const selected = this.tiebreakers().filter((value, index, values) => values.indexOf(value) === index);
    const filtered = selected.filter((value) => value !== 'BUCHHOLZ' || this.isSwiss());
    const points = this.points();
    if (Object.values(points).some((value) => typeof value === 'number' && value < 0)) return null;
    if (Object.values(points.bonus).some((value) => value !== null && value < 0)) return null;
    this.pointsWarning.set(points.win < points.draw);
    this.recalculationWarning.set(
      this.tournament()?.status === 'RUNNING' &&
        JSON.stringify(this.tournament()?.rules.points) !== JSON.stringify(points),
    );
    return {
      points,
      tiebreakers: [...filtered.filter((value) => value !== 'DRAW'), 'DRAW'],
      walkoverScore: { winner: this.winnerScore(), loser: this.loserScore() },
      bye: { awardsWinPoints: this.byeWinPoints(), countsScore: this.byeScore() },
      roster: { min: this.rosterMin(), max: this.rosterMax() },
    };
  }

  private detectPreset(points: PointsRules): Preset {
    if (JSON.stringify(points) === JSON.stringify(PRESET_POINTS_4_2_0_BONUS)) return '4_2_0';
    if (JSON.stringify(points) === JSON.stringify(PRESET_POINTS_3_2_1)) return '3_2_1';
    return 'CUSTOM';
  }

  private toInteger(value: string): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : -1;
  }
}
