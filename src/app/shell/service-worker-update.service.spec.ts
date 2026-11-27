import { TestBed } from '@angular/core/testing';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { Observable, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SERVICE_WORKER_STRINGS } from '../../i18n/service-worker-strings';
import { ServiceWorkerUpdateService } from './service-worker-update.service';

describe('ServiceWorkerUpdateService', () => {
  let versionEvents: Subject<VersionEvent>;
  let swUpdate: {
    readonly isEnabled: boolean;
    readonly versionUpdates: Observable<VersionEvent>;
    readonly checkForUpdate: ReturnType<typeof vi.fn>;
    readonly activateUpdate: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    versionEvents = new Subject<VersionEvent>();
    swUpdate = {
      isEnabled: true,
      versionUpdates: versionEvents.asObservable(),
      checkForUpdate: vi.fn().mockResolvedValue(false),
      activateUpdate: vi.fn().mockResolvedValue(false),
    };
  });

  afterEach(() => {
    versionEvents.complete();
    vi.restoreAllMocks();
  });

  it('notifies about a ready version without activating it automatically', () => {
    TestBed.configureTestingModule({
      providers: [ServiceWorkerUpdateService, { provide: SwUpdate, useValue: swUpdate }],
    });
    const service = TestBed.inject(ServiceWorkerUpdateService);
    service.checkForUpdates();

    versionEvents.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'current' },
      latestVersion: { hash: 'latest' },
    });

    expect(service.updateAvailable()).toBe(true);
    expect(swUpdate.activateUpdate).not.toHaveBeenCalled();
  });

  it('requires confirmation and reports a failed activation', async () => {
    TestBed.configureTestingModule({
      providers: [ServiceWorkerUpdateService, { provide: SwUpdate, useValue: swUpdate }],
    });
    const service = TestBed.inject(ServiceWorkerUpdateService);
    service.updateAvailable.set(true);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await service.updateNow();

    expect(window.confirm).toHaveBeenCalledWith(SERVICE_WORKER_STRINGS.confirmUpdate);
    expect(swUpdate.activateUpdate).toHaveBeenCalledOnce();
    expect(service.updateFailed()).toBe(true);
  });

  it('does not activate an update when the organizer cancels confirmation', async () => {
    TestBed.configureTestingModule({
      providers: [ServiceWorkerUpdateService, { provide: SwUpdate, useValue: swUpdate }],
    });
    const service = TestBed.inject(ServiceWorkerUpdateService);
    service.updateAvailable.set(true);
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await service.updateNow();

    expect(swUpdate.activateUpdate).not.toHaveBeenCalled();
  });

  it('keeps the loaded app usable when checking for updates fails', async () => {
    const error = new Error('service worker unavailable');
    swUpdate.checkForUpdate.mockRejectedValueOnce(error);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [ServiceWorkerUpdateService, { provide: SwUpdate, useValue: swUpdate }],
    });
    const service = TestBed.inject(ServiceWorkerUpdateService);
    service.checkForUpdates();
    await vi.waitFor(() => expect(service.updateFailed()).toBe(true));

    expect(service.updateAvailable()).toBe(false);
    expect(swUpdate.activateUpdate).not.toHaveBeenCalled();
  });
});
