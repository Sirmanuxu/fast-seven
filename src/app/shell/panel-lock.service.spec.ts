import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isDatabaseWriteAllowed, setDatabaseWriteAllowed } from '../../data/database-write-gate';
import { tournamentRepository } from '../../data/tournament-repository';
import { StoredPanelSession, tournamentDatabase } from '../../data/tournament-database';
import { PanelLockService } from './panel-lock.service';

class FakeBroadcastChannel {
  static readonly channels: FakeBroadcastChannel[] = [];
  static readonly names: string[] = [];
  private readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();

  constructor(name: string) {
    FakeBroadcastChannel.names.push(name);
    FakeBroadcastChannel.channels.push(this);
  }

  addEventListener(_type: string, listener: EventListenerOrEventListenerObject): void {
    if (typeof listener === 'function') {
      this.listeners.add(listener as (event: MessageEvent<unknown>) => void);
    }
  }

  removeEventListener(_type: string, listener: EventListenerOrEventListenerObject): void {
    if (typeof listener === 'function') {
      this.listeners.delete(listener as (event: MessageEvent<unknown>) => void);
    }
  }

  postMessage(data: unknown): void {
    for (const channel of FakeBroadcastChannel.channels) {
      if (channel !== this) {
        channel.listeners.forEach((listener) => listener(new MessageEvent('message', { data })));
      }
    }
  }

  close(): void {
    const channelIndex = FakeBroadcastChannel.channels.indexOf(this);
    if (channelIndex >= 0) FakeBroadcastChannel.channels.splice(channelIndex, 1);
  }
}

describe('PanelLockService', () => {
  let lockHeld = false;
  let locks: LockManager;
  let storedSession: StoredPanelSession | undefined;

  beforeEach(() => {
    lockHeld = false;
    FakeBroadcastChannel.channels.length = 0;
    FakeBroadcastChannel.names.length = 0;
    storedSession = undefined;
    setDatabaseWriteAllowed(true);
    locks = {
      request: async (
        name: string,
        _options: LockOptions,
        callback: (lock: Lock | null) => Promise<unknown>,
      ) => {
        if (lockHeld) return callback(null);
        lockHeld = true;
        try {
          return await callback({ name, mode: 'exclusive' } as Lock);
        } finally {
          lockHeld = false;
        }
      },
    } as unknown as LockManager;
    vi.stubGlobal('navigator', { locks });
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    vi.spyOn(tournamentDatabase.panelSession, 'get').mockImplementation(() =>
      Dexie.Promise.resolve(storedSession),
    );
    vi.spyOn(tournamentDatabase.panelSession, 'put').mockImplementation((session) => {
      storedSession = session;
      return Dexie.Promise.resolve('current');
    });
    vi.spyOn(tournamentRepository, 'getTournament').mockResolvedValue(null);
  });

  afterEach(() => {
    setDatabaseWriteAllowed(true);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps a second panel read-only until the active panel yields control', async () => {
    const firstPanel = new PanelLockService();
    const secondPanel = new PanelLockService();

    await firstPanel.activate();
    await secondPanel.activate();

    expect(firstPanel.status()).toBe('OWNER');
    expect(secondPanel.status()).toBe('READ_ONLY');

    await secondPanel.takeControl();

    expect(firstPanel.status()).toBe('READ_ONLY');
    expect(secondPanel.status()).toBe('OWNER');
    expect(isDatabaseWriteAllowed()).toBe(true);
    expect(tournamentDatabase.panelSession.put).toHaveBeenCalledWith(
      expect.objectContaining({ cleanShutdown: true }),
    );

    firstPanel.dispose();
    secondPanel.dispose();
  });

  it('reports an unclean prior session with its last saved timestamp', async () => {
    vi.spyOn(tournamentDatabase.panelSession, 'get').mockResolvedValue({
      id: 'current',
      cleanShutdown: false,
      startedAt: '2026-11-27T10:00:00.000Z',
      lastSavedAt: '2026-11-27T10:05:00.000Z',
    });
    const panel = new PanelLockService();

    await panel.activate();

    expect(panel.recovery()).toEqual({ lastSavedAt: '2026-11-27T10:05:00.000Z' });
    panel.dispose();
  });
});
