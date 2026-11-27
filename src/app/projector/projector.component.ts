import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { PROJECTOR_STRINGS } from '../../i18n/projector-strings';
import { ProjectorChannel, ProjectorChannelMessage } from '../../sync/projector-channel';
import { tournamentRepository } from '../../data/tournament-repository';
import {
  ProjectorState,
  ProjectorTimer,
  ProjectorViewKind,
  Team,
  TournamentSnapshot,
} from '../../domain/model';
import { selectProjectorContext } from '../../domain/projector-context';
import {
  formatProjectorTimer,
  isProjectorTimerExpired,
  isProjectorTimerVisible,
} from '../../domain/projector-timer';
import {
  buildProjectorViewModel,
  getTiebreakLabel,
  ProjectorBracketView,
  ProjectorMatchCard,
} from './projector-view-model';

@Component({
  imports: [NgTemplateOutlet],
  selector: 'app-projector',
  templateUrl: './projector.component.html',
  styleUrl: './projector.component.css',
})
export class ProjectorComponent implements OnInit {
  private readonly projectorChannel = new ProjectorChannel();
  private readonly destroyRef = inject(DestroyRef);

  protected readonly strings = PROJECTOR_STRINGS;
  protected readonly snapshot = signal<TournamentSnapshot | null>(null);
  protected readonly projectorState = signal<ProjectorState>({
    forcedView: null,
    message: null,
    timer: null,
  });
  protected readonly connected = signal(false);
  protected readonly legacyMessage = signal<string | null>(null);
  protected readonly timerNow = signal(Date.now());
  protected readonly contextNow = signal(Date.now());
  protected readonly subviewIndex = signal(0);
  protected readonly rotationIndex = signal(0);
  protected readonly rotationPlan = computed(() => {
    const snapshot = this.snapshot();
    return selectProjectorContext({
      tournamentStatus: snapshot?.tournament.status ?? null,
      matches: snapshot?.matches ?? [],
      timer: this.projectorState().timer,
      nowEpochMs: this.contextNow(),
    });
  });
  protected readonly viewModel = computed(() => {
    const plan = this.rotationPlan();
    const state = this.projectorState();
    const model = buildProjectorViewModel(
      this.snapshot(),
      state.forcedView,
      this.contextNow(),
      plan.resultMatchId,
    );
    if (state.forcedView) return model;

    const availableViews = plan.views.filter((view) => model.availableViews.includes(view.kind));
    const selectedView =
      availableViews.length > 0
        ? availableViews[this.rotationIndex() % availableViews.length]
        : undefined;
    return selectedView ? { ...model, activeView: selectedView.kind } : model;
  });
  private latestSequence = 0;
  private rotationContextKey: string | null = null;
  private rotationDeadlineEpochMs = 0;
  private readonly senderId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `projector-${Date.now()}-${Math.random()}`;

  async ngOnInit(): Promise<void> {
    this.snapshot.set(await tournamentRepository.getSnapshot());
    this.projectorState.set(await tournamentRepository.getProjectorState());
    this.updateAutomaticRotation(Date.now());

    const stopListening = this.projectorChannel.listen((message) => {
      this.applyMessage(message);
    });
    this.destroyRef.onDestroy(() => {
      stopListening();
      this.projectorChannel.close();
    });

    this.projectorChannel.greet(this.senderId);

    const heartbeatTimer = window.setInterval(() => {
      this.projectorChannel.heartbeat(this.senderId);
    }, 2000);
    this.destroyRef.onDestroy(() => window.clearInterval(heartbeatTimer));

    const timerTick = window.setInterval(() => {
      const now = Date.now();
      this.timerNow.set(now);
      this.updateAutomaticRotation(now);
    }, 250);
    this.destroyRef.onDestroy(() => window.clearInterval(timerTick));

    const subviewRotation = window.setInterval(() => {
      const forcedView = this.projectorState().forcedView;
      const hasForcedSubview =
        (forcedView?.kind === 'BRACKET' && forcedView.stageId !== undefined);
      if (
        !hasForcedSubview &&
        this.viewModel().activeView === 'BRACKET' &&
        this.viewModel().brackets.length > 1
      ) {
        this.subviewIndex.update((index) => index + 1);
      }
    }, 12_000);
    this.destroyRef.onDestroy(() => window.clearInterval(subviewRotation));

    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.destroyRef.onDestroy(() =>
      document.removeEventListener('visibilitychange', this.onVisibilityChange),
    );
  }

  protected async requestFullscreen(): Promise<void> {
    await document.documentElement.requestFullscreen();
  }

  protected viewTitle(view: ProjectorViewKind): string {
    return this.strings.viewTitles[view];
  }

  protected teamTextColor(team: Team): '#000000' | '#ffffff' {
    return this.viewModel().teams.find((card) => card.team.id === team.id)?.textColor ?? '#ffffff';
  }

  protected tiebreakLabel(criterion: string): string {
    return getTiebreakLabel(criterion);
  }

  protected selectedBracket(): ProjectorBracketView | null {
    const brackets = this.viewModel().brackets;
    const forcedView = this.projectorState().forcedView;
    const stageId = forcedView?.kind === 'BRACKET' ? forcedView.stageId : undefined;
    if (stageId) return brackets.find((view) => view.id === stageId) ?? null;
    return brackets.length > 0 ? brackets[this.subviewIndex() % brackets.length] : null;
  }

  protected statusLabel(status: ProjectorMatchCard['status']): string {
    if (status === 'IN_PROGRESS') return this.strings.matchInProgress;
    if (status === 'FINISHED') return this.strings.matchFinished;
    return this.strings.matchPending;
  }

  protected remainingTime(): string | null {
    const timer = this.projectorState().timer;
    if (!timer) return null;
    return formatProjectorTimer(timer, this.timerNow());
  }

  protected shouldShowTimer(timer: ProjectorTimer): boolean {
    return isProjectorTimerVisible(
      timer,
      this.timerNow(),
      this.projectorState().forcedView !== null,
      this.rotationPlan().context,
    );
  }

  protected isTimerExpired(timer: ProjectorTimer): boolean {
    return isProjectorTimerExpired(timer, this.timerNow());
  }

  protected formatPosition(position: number, tied: boolean): string {
    return `${position}°${tied ? ` (${this.strings.tied})` : ''}`;
  }

  protected interpolateUnattributedTries(count: number): string {
    return this.strings.unattributedTries.replace('{count}', String(count));
  }

  protected trackMatch(_: number, match: ProjectorMatchCard): string {
    return match.id;
  }

  private readonly onVisibilityChange = (): void => {
    if (!document.hidden) {
      void this.resync();
    }
  };

  private async resync(): Promise<void> {
    this.snapshot.set(await tournamentRepository.getSnapshot());
    this.projectorState.set(await tournamentRepository.getProjectorState());
    this.updateAutomaticRotation(Date.now());
    this.projectorChannel.requestResync(this.senderId);
  }

  private applyMessage(message: ProjectorChannelMessage): void {
    if (message.type === 'STATE') {
      if (message.sequence < this.latestSequence) return;
      this.latestSequence = message.sequence;
      this.snapshot.set(message.snapshot);
      this.projectorState.set(message.projectorState);
      this.connected.set(true);
      this.updateAutomaticRotation(Date.now());
    } else if (message.type === 'LEGACY_PING') {
      this.legacyMessage.set(message.text);
      this.connected.set(true);
    }
  }

  private updateAutomaticRotation(nowEpochMs: number): void {
    const snapshot = this.snapshot();
    const state = this.projectorState();
    const plan = selectProjectorContext({
      tournamentStatus: snapshot?.tournament.status ?? null,
      matches: snapshot?.matches ?? [],
      timer: state.timer,
      nowEpochMs,
    });

    if (plan.contextKey !== this.rotationContextKey) {
      this.rotationContextKey = plan.contextKey;
      this.rotationIndex.set(0);
      this.rotationDeadlineEpochMs = nowEpochMs + plan.viewDurationMs;
      this.contextNow.set(nowEpochMs);
      return;
    }

    if (nowEpochMs < this.rotationDeadlineEpochMs) return;

    if (!state.forcedView) {
      const model = buildProjectorViewModel(snapshot, null, nowEpochMs, plan.resultMatchId);
      const availableViews = plan.views.filter((view) => model.availableViews.includes(view.kind));
      if (availableViews.length > 1) {
        this.rotationIndex.update((index) => (index + 1) % availableViews.length);
      }
    }

    this.rotationDeadlineEpochMs = nowEpochMs + plan.viewDurationMs;
    this.contextNow.set(nowEpochMs);
  }
}
