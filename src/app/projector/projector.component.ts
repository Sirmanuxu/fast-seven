import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { SPIKE_STRINGS } from '../../i18n/spike-strings';
import { ProjectorChannel, ProjectorChannelMessage } from '../../sync/projector-channel';
import { tournamentRepository } from '../../data/tournament-repository';
import { ProjectorState, TournamentSnapshot } from '../../domain/model';

@Component({
  selector: 'app-projector',
  templateUrl: './projector.component.html',
  styleUrl: './projector.component.css',
})
export class ProjectorComponent implements OnInit {
  private readonly projectorChannel = new ProjectorChannel();
  private readonly destroyRef = inject(DestroyRef);

  protected readonly strings = SPIKE_STRINGS;
  protected readonly snapshot = signal<TournamentSnapshot | null>(null);
  protected readonly projectorState = signal<ProjectorState>({
    forcedView: null,
    message: null,
    timer: null,
  });
  protected readonly connected = signal(false);
  protected readonly legacyMessage = signal<string | null>(null);
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

    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.destroyRef.onDestroy(() =>
      document.removeEventListener('visibilitychange', this.onVisibilityChange),
    );
  }

  protected async requestFullscreen(): Promise<void> {
    await document.documentElement.requestFullscreen();
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
