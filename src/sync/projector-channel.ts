import { ProjectorState, TournamentSnapshot } from '../domain/model';

export const PROJECTOR_CHANNEL_NAME = 'fast-seven-projector';

export interface ProjectorStateMessage {
  readonly type: 'STATE';
  readonly sequence: number;
  readonly sentAt: number;
  readonly snapshot: TournamentSnapshot | null;
  readonly projectorState: ProjectorState;
}

export interface ProjectorRequestMessage {
  readonly type: 'HELLO' | 'RESYNC';
  readonly senderId: string;
  readonly sentAt: number;
}

export interface ProjectorHeartbeatMessage {
  readonly type: 'HEARTBEAT';
  readonly senderId: string;
  readonly sentAt: number;
}

export type ProjectorChannelMessage =
  | ProjectorStateMessage
  | ProjectorRequestMessage
  | ProjectorHeartbeatMessage
  | { readonly type: 'LEGACY_PING'; readonly text: string; readonly sentAt: number };

export class ProjectorChannel {
  private readonly channel: BroadcastChannel;

  constructor() {
    this.channel = new BroadcastChannel(PROJECTOR_CHANNEL_NAME);
  }

  publish(text: string): void {
    this.publishRaw({
      type: 'LEGACY_PING',
      text,
      sentAt: Date.now(),
    });
  }

  publishState(
    sequence: number,
    snapshot: TournamentSnapshot | null,
    projectorState: ProjectorState,
  ): void {
    this.publishRaw({
      type: 'STATE',
      sequence,
      sentAt: Date.now(),
      snapshot,
      projectorState,
    });
  }

  greet(senderId: string): void {
    this.publishRaw({ type: 'HELLO', senderId, sentAt: Date.now() });
  }

  requestResync(senderId: string): void {
    this.publishRaw({ type: 'RESYNC', senderId, sentAt: Date.now() });
  }

  heartbeat(senderId: string): void {
    this.publishRaw({ type: 'HEARTBEAT', senderId, sentAt: Date.now() });
  }

  listen(onMessage: (message: ProjectorChannelMessage) => void): () => void {
    const handler = (event: MessageEvent<ProjectorChannelMessage>) => onMessage(event.data);
    this.channel.addEventListener('message', handler);
    return () => this.channel.removeEventListener('message', handler);
  }

  close(): void {
    this.channel.close();
  }

  private publishRaw(message: ProjectorChannelMessage): void {
    this.channel.postMessage(message);
  }
}
