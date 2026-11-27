import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { PROJECTOR_STRINGS } from '../../i18n/projector-strings';
import { ProjectorChannel, ProjectorChannelMessage } from '../../sync/projector-channel';
import { tournamentRepository } from '../../data/tournament-repository';
import { ProjectorState, ProjectorViewKind, Team, TournamentSnapshot } from '../../domain/model';
import {
  buildProjectorViewModel,
  getTiebreakLabel,
  ProjectorBracketView,
  ProjectorMatchCard,
  ProjectorStandingsView,
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
  protected readonly subviewIndex = signal(0);
  protected readonly viewModel = computed(() =>
    buildProjectorViewModel(this.snapshot(), this.projectorState().forcedView, Date.now()),
  );
  private latestSequence = 0;
  private readonly senderId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `projector-${Date.now()}-${Math.random()}`;

  async ngOnInit(): Promise<void> {
    this.snapshot.set(await tournamentRepository.getSnapshot());
    this.projectorState.set(await tournamentRepository.getProjectorState());

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

    const timerTick = window.setInterval(() => this.timerNow.set(Date.now()), 250);
    this.destroyRef.onDestroy(() => window.clearInterval(timerTick));

    const subviewRotation = window.setInterval(() => {
      const forcedView = this.projectorState().forcedView;
      const hasForcedSubview =
        (forcedView?.kind === 'STANDINGS' && forcedView.groupId !== undefined) ||
        (forcedView?.kind === 'BRACKET' && forcedView.stageId !== undefined);
      if (!hasForcedSubview && this.viewModel().activeView === 'STANDINGS' && this.viewModel().standings.length > 1) {
        this.subviewIndex.update((index) => index + 1);
      } else if (!hasForcedSubview && this.viewModel().activeView === 'BRACKET' && this.viewModel().brackets.length > 1) {
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

  protected selectedStandings(): ProjectorStandingsView | null {
    const standings = this.viewModel().standings;
    const forcedView = this.projectorState().forcedView;
    const groupId = forcedView?.kind === 'STANDINGS' ? forcedView.groupId : undefined;
    if (groupId) return standings.find((view) => view.id === groupId) ?? null;
    return standings.length > 0 ? standings[this.subviewIndex() % standings.length] : null;
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
    const seconds = Math.max(0, Math.ceil((timer.endsAtEpochMs - this.timerNow()) / 1000));
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
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
    this.projectorChannel.requestResync(this.senderId);
  }

  private applyMessage(message: ProjectorChannelMessage): void {
    if (message.type === 'STATE') {
      if (message.sequence < this.latestSequence) return;
      this.latestSequence = message.sequence;
      this.snapshot.set(message.snapshot);
      this.projectorState.set(message.projectorState);
      this.connected.set(true);
    } else if (message.type === 'LEGACY_PING') {
      this.legacyMessage.set(message.text);
      this.connected.set(true);
    }
  }
}
