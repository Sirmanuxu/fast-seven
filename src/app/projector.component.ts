import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { SPIKE_STRINGS } from '../i18n/spike-strings';
import { ProjectorChannel, ProjectorPing } from '../sync/projector-channel';

@Component({
  selector: 'app-projector',
  templateUrl: './projector.component.html',
  styleUrl: './projector.component.css',
})
export class ProjectorComponent implements OnInit {
  private readonly projectorChannel = new ProjectorChannel();
  private readonly destroyRef = inject(DestroyRef);

  protected readonly strings = SPIKE_STRINGS;
  protected readonly message = signal<ProjectorPing | null>(null);
  protected readonly latencyMs = signal<number | null>(null);

  ngOnInit(): void {
    const stopListening = this.projectorChannel.listen((message) => {
      this.message.set(message);
      this.latencyMs.set(Math.max(0, Date.now() - message.sentAt));
    });
    this.destroyRef.onDestroy(() => {
      stopListening();
      this.projectorChannel.close();
    });
  }
}
