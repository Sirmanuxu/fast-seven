import { computed, signal } from '@angular/core';
import { databaseWriteSucceeded, setDatabaseWriteAllowed } from '../../data/database-write-gate';
import { StoredPanelSession, tournamentDatabase } from '../../data/tournament-database';
import { tournamentRepository } from '../../data/tournament-repository';

type PanelLockStatus =
  | 'INACTIVE'
  | 'ACQUIRING'
  | 'OWNER'
  | 'READ_ONLY'
  | 'TAKING_CONTROL'
  | 'UNSUPPORTED'
  | 'FAILED';

const PANEL_LOCK_NAME = 'fast-seven-panel-writer';
const PANEL_CHANNEL_NAME = 'fast-seven-panel-control';
const TAKEOVER_REQUEST = 'TAKEOVER_REQUEST';

export class PanelLockService {
  readonly status = signal<PanelLockStatus>('INACTIVE');
  readonly active = signal(false);
  readonly readOnly = computed(() => this.active() && this.status() !== 'OWNER');
  readonly recovery = signal<{ readonly lastSavedAt: string | null } | null>(null);
  readonly takeoverFailed = signal(false);

  private channel: BroadcastChannel | null = null;
  private releaseLock: (() => void) | null = null;
  private saveTimestampTimer: number | null = null;
  private deactivation: Promise<void> | null = null;
  private readonly onPageHide = (): void => {
    void this.deactivate();
  };
  private readonly writeSubscription = databaseWriteSucceeded.subscribe(() => {
    if (this.status() !== 'OWNER') return;
    if (this.saveTimestampTimer !== null) window.clearTimeout(this.saveTimestampTimer);
    this.saveTimestampTimer = window.setTimeout(() => {
      this.saveTimestampTimer = null;
      void this.recordSuccessfulSave();
    }, 0);
  });

  async activate(): Promise<void> {
    if (this.deactivation) await this.deactivation;
    if (this.active()) return;
    this.active.set(true);
    setDatabaseWriteAllowed(false);
    if (!navigator.locks || typeof BroadcastChannel === 'undefined') {
      this.status.set('UNSUPPORTED');
      return;
    }

    this.channel = new BroadcastChannel(PANEL_CHANNEL_NAME);
    this.channel.addEventListener('message', this.onChannelMessage);
    window.addEventListener('pagehide', this.onPageHide);
    this.status.set('ACQUIRING');
    const acquired = await this.requestLock();
    if (!acquired && this.status() !== 'FAILED') this.status.set('READ_ONLY');
  }

  async deactivate(): Promise<void> {
    if (this.deactivation) return this.deactivation;
    if (!this.active()) return;
    const owned = this.status() === 'OWNER';
    this.active.set(false);
    this.status.set('INACTIVE');
    setDatabaseWriteAllowed(false);
    if (this.saveTimestampTimer !== null) {
      window.clearTimeout(this.saveTimestampTimer);
      this.saveTimestampTimer = null;
    }
    this.deactivation = (async () => {
      if (owned) await this.markSessionClean();
      this.releaseLock?.();
      this.releaseLock = null;
      window.removeEventListener('pagehide', this.onPageHide);
      this.channel?.removeEventListener('message', this.onChannelMessage);
      this.channel?.close();
      this.channel = null;
    })();
    try {
      await this.deactivation;
    } finally {
      this.deactivation = null;
    }
  }

  async takeControl(): Promise<void> {
    if (this.status() !== 'READ_ONLY' || !navigator.locks) return;
    this.takeoverFailed.set(false);
    this.status.set('TAKING_CONTROL');
    this.channel?.postMessage({ type: TAKEOVER_REQUEST });

    const deadline = Date.now() + 10_000;
    while (this.active() && Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      if (await this.requestLock()) return;
    }

    if (this.active() && this.status() !== 'OWNER') {
      this.status.set('READ_ONLY');
      this.takeoverFailed.set(true);
    }
  }

  dismissRecovery(): void {
    this.recovery.set(null);
  }

  dispose(): void {
    void this.deactivate();
    this.writeSubscription.unsubscribe();
  }

  private readonly onChannelMessage = (event: MessageEvent<unknown>): void => {
    if (
      typeof event.data === 'object' &&
      event.data !== null &&
      'type' in event.data &&
      event.data.type === TAKEOVER_REQUEST
    ) {
      void this.yieldControl();
    }
  };

  private requestLock(): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: boolean): void => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      void navigator.locks
        .request(PANEL_LOCK_NAME, { ifAvailable: true }, async (lock) => {
          if (!lock) {
            finish(false);
            return;
          }

          setDatabaseWriteAllowed(true);
          try {
            await this.initializeSession();
          } catch (error) {
            console.error('Initializing the panel session failed', error);
            setDatabaseWriteAllowed(false);
            this.status.set('FAILED');
            finish(false);
            return;
          }
          this.status.set('OWNER');
          this.takeoverFailed.set(false);
          finish(true);
          await new Promise<void>((release) => {
            this.releaseLock = release;
          });
          this.releaseLock = null;
        })
        .catch((error: unknown) => {
          console.error('Acquiring the panel write lock failed', error);
          setDatabaseWriteAllowed(false);
          this.status.set('FAILED');
          finish(false);
        });
    });
  }

  private async initializeSession(): Promise<void> {
    const previous = await tournamentDatabase.panelSession.get('current');
    const tournament = await tournamentRepository.getTournament();
    const lastSavedAt = previous?.lastSavedAt ?? tournament?.updatedAt ?? null;
    if (previous && !previous.cleanShutdown) this.recovery.set({ lastSavedAt });
    const session: StoredPanelSession = {
      id: 'current',
      cleanShutdown: false,
      startedAt: new Date().toISOString(),
      lastSavedAt,
    };
    await tournamentDatabase.panelSession.put(session);
  }

  private async recordSuccessfulSave(): Promise<void> {
    if (this.status() !== 'OWNER') return;
    try {
      const session = await tournamentDatabase.panelSession.get('current');
      if (!session) return;
      await tournamentDatabase.panelSession.put({
        ...session,
        cleanShutdown: false,
        lastSavedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Recording the last successful database save failed', error);
    }
  }

  private async markSessionClean(): Promise<void> {
    try {
      const session = await tournamentDatabase.panelSession.get('current');
      if (!session) return;
      await tournamentDatabase.panelSession.put({ ...session, cleanShutdown: true });
    } catch (error) {
      console.error('Marking the panel session as clean failed', error);
    }
  }

  private async yieldControl(): Promise<void> {
    if (this.status() !== 'OWNER') return;
    this.status.set('READ_ONLY');
    setDatabaseWriteAllowed(false);
    await this.markSessionClean();
    this.releaseLock?.();
    this.releaseLock = null;
  }
}
