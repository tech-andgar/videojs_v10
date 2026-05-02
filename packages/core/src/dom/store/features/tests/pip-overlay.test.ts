import { createStore } from '@videojs/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaPipOverlayState } from '../../../../core/media/state';
import type { PlayerTarget } from '../../../media/types';
import { createMockVideo } from '../../../tests/test-helpers';
import { PIP_OVERLAY_MEDIA_SYMBOL, pipOverlayFeature } from '../pip-overlay';

describe('pipOverlayFeature', () => {
  let originalResizeObserver: typeof ResizeObserver | undefined;

  beforeEach(() => {
    originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class ResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    } as any;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver as any;
    vi.restoreAllMocks();
  });

  describe('state & actions', () => {
    it('has correct initial state', () => {
      const store = createStore<PlayerTarget>()(pipOverlayFeature);
      const state = store.state as unknown as MediaPipOverlayState;

      expect(state.pipOverlayActive).toBe(false);
      expect(state.pipOverlaySrc).toBe(null);
      expect(state.pipOverlayScale).toBe(0.28);
      expect(state.pipOverlayRequiresGesture).toBe(false);
    });

    it('showPipOverlay sets active and resolves source', () => {
      const store = createStore<PlayerTarget>()(pipOverlayFeature);
      const state = store.state as unknown as MediaPipOverlayState;

      // When there's no source, it doesn't activate
      state.showPipOverlay();
      expect(store.state.pipOverlayActive).toBe(false);

      // When providing a source, it activates
      state.showPipOverlay('video.mp4');
      expect(store.state.pipOverlayActive).toBe(true);
      expect(store.state.pipOverlaySrc).toBe('video.mp4');
    });

    it('togglePipOverlay toggles state', () => {
      const store = createStore<PlayerTarget>()(pipOverlayFeature);
      const state = store.state as unknown as MediaPipOverlayState;

      state.togglePipOverlay('video.mp4');
      expect(store.state.pipOverlayActive).toBe(true);

      state.togglePipOverlay();
      expect(store.state.pipOverlayActive).toBe(false);
    });

    it('clamps position and scale', () => {
      const store = createStore<PlayerTarget>()(pipOverlayFeature);
      const state = store.state as unknown as MediaPipOverlayState;

      state.setPipOverlayPosition(1.5, -0.5);
      expect(store.state.pipOverlayPosition).toEqual({ x: 1, y: 0 });

      state.setPipOverlayScale(2);
      expect(store.state.pipOverlayScale).toBe(0.5); // max 0.5

      state.setPipOverlayScale(0.01);
      expect(store.state.pipOverlayScale).toBe(0.15); // min 0.15
    });

    it('resolves sources and language correctly', () => {
      const store = createStore<PlayerTarget>()(pipOverlayFeature);
      const state = store.state as unknown as MediaPipOverlayState;

      state.setPipOverlaySources([
        { src: 'en.mp4', lang: 'en' },
        { src: 'es.mp4', lang: 'es' },
      ]);
      expect(store.state.pipOverlaySrc).toBe('en.mp4');

      state.setPipOverlayLang('es');
      expect(store.state.pipOverlaySrc).toBe('es.mp4');
    });
  });

  describe('synchronization', () => {
    it('soft syncs playbackRate when drift is between 0.3s and 2s', () => {
      const mainMedia = createMockVideo();
      mainMedia.playbackRate = 1.0;

      const pipMedia = createMockVideo();
      pipMedia.playbackRate = 1.0;
      pipMedia.play = vi.fn().mockResolvedValue(undefined);

      const container = document.createElement('div') as any;
      container[PIP_OVERLAY_MEDIA_SYMBOL] = pipMedia;

      const store = createStore<PlayerTarget>()(pipOverlayFeature);
      const state = store.state as unknown as MediaPipOverlayState;
      store.attach({ media: mainMedia, container });

      // Make it active
      state.showPipOverlay('src.mp4');

      // Main is at 5.0, PIP is behind at 4.5 -> Drift 0.5
      mainMedia.currentTime = 5.0;
      pipMedia.currentTime = 4.5;
      mainMedia.dispatchEvent(new Event('timeupdate'));

      // Should speed up
      expect(pipMedia.playbackRate).toBe(1.1);

      // Main is at 5.0, PIP is ahead at 5.5 -> Drift -0.5
      mainMedia.currentTime = 5.0;
      pipMedia.currentTime = 5.5;
      mainMedia.dispatchEvent(new Event('timeupdate'));

      // Should slow down
      expect(pipMedia.playbackRate).toBe(0.9);
    });

    it('hard syncs currentTime when drift > 2s', () => {
      const mainMedia = createMockVideo();
      const pipMedia = createMockVideo();

      const container = document.createElement('div') as any;
      container[PIP_OVERLAY_MEDIA_SYMBOL] = pipMedia;

      const store = createStore<PlayerTarget>()(pipOverlayFeature);
      const state = store.state as unknown as MediaPipOverlayState;
      store.attach({ media: mainMedia, container });
      state.showPipOverlay('src.mp4');

      mainMedia.currentTime = 10.0;
      pipMedia.currentTime = 5.0; // 5s drift
      mainMedia.dispatchEvent(new Event('timeupdate'));

      expect(pipMedia.currentTime).toBe(10.0);
    });

    it('syncs play state', () => {
      const mainMedia = createMockVideo({ paused: false });
      const pipMedia = createMockVideo({ paused: true });
      pipMedia.play = vi.fn().mockResolvedValue(undefined);
      pipMedia.pause = vi.fn();

      const container = document.createElement('div') as any;
      container[PIP_OVERLAY_MEDIA_SYMBOL] = pipMedia;

      const store = createStore<PlayerTarget>()(pipOverlayFeature);
      const state = store.state as unknown as MediaPipOverlayState;
      store.attach({ media: mainMedia, container });
      state.showPipOverlay('src.mp4');

      mainMedia.dispatchEvent(new Event('play'));
      expect(pipMedia.play).toHaveBeenCalled();

      Object.defineProperty(mainMedia, 'paused', { value: true, configurable: true });
      Object.defineProperty(pipMedia, 'paused', { value: false, configurable: true });
      mainMedia.dispatchEvent(new Event('pause'));
      expect(pipMedia.pause).toHaveBeenCalled();
    });

    it('handles NotAllowedError and sets gesture flag', async () => {
      const mainMedia = createMockVideo({ paused: false });
      const pipMedia = createMockVideo({ paused: true });

      const notAllowedError = new DOMException('Play blocked', 'NotAllowedError');
      pipMedia.play = vi.fn().mockRejectedValue(notAllowedError);

      const container = document.createElement('div') as any;
      container[PIP_OVERLAY_MEDIA_SYMBOL] = pipMedia;

      const store = createStore<PlayerTarget>()(pipOverlayFeature);
      const state = store.state as unknown as MediaPipOverlayState;
      store.attach({ media: mainMedia, container });
      state.showPipOverlay('src.mp4');

      mainMedia.dispatchEvent(new Event('play'));

      // Wait for promise rejection
      await Promise.resolve();

      expect(store.state.pipOverlayRequiresGesture).toBe(true);

      state.resolvePipOverlayGesture();
      expect(store.state.pipOverlayRequiresGesture).toBe(false);
    });
  });
});
