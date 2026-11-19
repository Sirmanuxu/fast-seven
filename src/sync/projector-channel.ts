export const PROJECTOR_CHANNEL_NAME = 'fast-seven-projector';

export interface ProjectorPing {
  readonly text: string;
  readonly sentAt: number;
}

export class ProjectorChannel {
  private readonly channel: BroadcastChannel;

  constructor() {
    this.channel = new BroadcastChannel(PROJECTOR_CHANNEL_NAME);
  }

  publish(text: string): void {
    const message: ProjectorPing = {
      text,
      sentAt: Date.now(),
    };
    this.channel.postMessage(message);
  }

  listen(onMessage: (message: ProjectorPing) => void): () => void {
    const handler = (event: MessageEvent<ProjectorPing>) => onMessage(event.data);
    this.channel.addEventListener('message', handler);
    return () => this.channel.removeEventListener('message', handler);
  }

  close(): void {
    this.channel.close();
  }
}
