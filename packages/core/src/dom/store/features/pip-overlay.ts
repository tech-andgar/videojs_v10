import { listen } from '@videojs/utils/dom';

import type { MediaPipOverlayState } from '../../../core/media/state';
import { definePlayerFeature } from '../../feature';
import { isMediaPauseCapable, isMediaPlaybackRateCapable, isMediaSeekCapable } from '../../media/predicate';

export const PIP_OVERLAY_MEDIA_SYMBOL = Symbol('@videojs/pip-overlay-media');

export const pipOverlayFeature = definePlayerFeature({
  name: 'pip-overlay',

  state: ({ get, set }): MediaPipOverlayState => ({
    pipOverlayActive: false,
    pipOverlaySrc: null,
    pipOverlaySources: [],
    pipOverlayLang: null,
    pipOverlayPosition: { x: 0.78, y: 0.72 },
    pipOverlayScale: 0.28,
    pipOverlayConstrained: true,
    pipOverlayLoadingState: 'spinner',
    pipOverlayAnimation: 'scale-fade',
    pipOverlayError: null,
    pipOverlayRequiresGesture: false,

    showPipOverlay(src?) {
      const state = get() as unknown as MediaPipOverlayState;
      const resolved = src ?? state.pipOverlaySrc ?? state.pipOverlaySources[0]?.src ?? null;
      console.log('[pip-overlay] showPipOverlay', { src, resolved });
      if (resolved) {
        set({ pipOverlayActive: true, pipOverlaySrc: resolved, pipOverlayError: null });
      }
    },

    hidePipOverlay() {
      console.log('[pip-overlay] hidePipOverlay');
      set({ pipOverlayActive: false });
    },

    togglePipOverlay(src?) {
      const state = get() as unknown as MediaPipOverlayState;
      console.log('[pip-overlay] togglePipOverlay', { active: state.pipOverlayActive });
      if (state.pipOverlayActive) {
        set({ pipOverlayActive: false });
      } else {
        state.showPipOverlay(src);
      }
    },

    setPipOverlayPosition(x, y) {
      const state = get() as unknown as MediaPipOverlayState;
      const clamp = (v: number) => (state.pipOverlayConstrained ? Math.max(0, Math.min(1, v)) : v);
      const newX = clamp(x);
      const newY = clamp(y);
      console.log('[pip-overlay] setPosition', { x: newX, y: newY });
      set({ pipOverlayPosition: { x: newX, y: newY } });
    },

    setPipOverlayScale(scale) {
      const newScale = Math.max(0.15, Math.min(0.5, scale));
      console.log('[pip-overlay] setScale', { scale: newScale });
      set({ pipOverlayScale: newScale });
    },

    setPipOverlaySources(sources) {
      console.log('[pip-overlay] setSources', sources);
      set({ pipOverlaySources: sources });
      const state = get() as unknown as MediaPipOverlayState;
      if (!state.pipOverlaySrc && sources.length > 0 && sources[0]) {
        console.log('[pip-overlay] Auto-selecting first source:', sources[0].src);
        set({ pipOverlaySrc: sources[0].src });
      }
    },

    setPipOverlayLang(lang) {
      const state = get() as unknown as MediaPipOverlayState;
      const source = state.pipOverlaySources.find((s) => s.lang === lang);
      if (source) {
        set({ pipOverlayLang: lang, pipOverlaySrc: source.src });
      }
    },

    addPipOverlaySource(source) {
      const state = get() as unknown as MediaPipOverlayState;
      if (!state.pipOverlaySources.some((s) => s.src === source.src)) {
        state.setPipOverlaySources([...state.pipOverlaySources, source]);
      }
    },

    removePipOverlaySource(src) {
      const state = get() as unknown as MediaPipOverlayState;
      state.setPipOverlaySources(state.pipOverlaySources.filter((s) => s.src !== src));
    },

    setPipOverlayError(error) {
      set({ pipOverlayError: error });
    },

    dismissPipOverlayError() {
      set({ pipOverlayError: null });
    },

    resolvePipOverlayGesture() {
      set({ pipOverlayRequiresGesture: false });
    },
  }),

  attach({ target, signal, get, set }) {
    const { media, container } = target;

    if (!container || !isMediaPauseCapable(media) || !isMediaSeekCapable(media)) {
      return;
    }

    const getPipMedia = (): HTMLVideoElement | null =>
      (container as unknown as Record<symbol, unknown>)[PIP_OVERLAY_MEDIA_SYMBOL] as HTMLVideoElement | null;

    // --- Soft Sync Logic ---
    const syncTime = () => {
      const pip = getPipMedia();
      const state = get() as unknown as MediaPipOverlayState;
      if (!pip || !state.pipOverlayActive || !isMediaPlaybackRateCapable(media)) return;

      const drift = pip.currentTime - media.currentTime;
      const absDrift = Math.abs(drift);

      if (absDrift > 2) {
        console.log('[pip-overlay] Hard sync (drift > 2s):', drift);
        pip.currentTime = media.currentTime; // Hard sync for large drift
      } else if (absDrift > 0.3) {
        // Soft sync via rate
        const baseRate = media.playbackRate;
        pip.playbackRate = drift > 0 ? baseRate * 0.9 : baseRate * 1.1;
        console.log('[pip-overlay] Soft sync (playbackRate adj):', pip.playbackRate);
      } else if (pip.playbackRate !== media.playbackRate) {
        pip.playbackRate = media.playbackRate; // Restore normal rate
      }
    };

    const syncPlayState = () => {
      const pip = getPipMedia();
      const state = get() as unknown as MediaPipOverlayState;
      if (!pip || !state.pipOverlayActive) return;

      if (media.paused && !pip.paused) {
        console.log('[pip-overlay] Sync: Pausing secondary');
        pip.pause();
      } else if (!media.paused && pip.paused) {
        console.log('[pip-overlay] Sync: Playing secondary');
        pip.play().catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'NotAllowedError') {
            console.warn('[pip-overlay] Autoplay blocked, requires gesture');
            set({ pipOverlayRequiresGesture: true });
          }
        });
      }
    };

    const syncRate = () => {
      const pip = getPipMedia();
      const state = get() as unknown as MediaPipOverlayState;
      if (!pip || !state.pipOverlayActive || !isMediaPlaybackRateCapable(media)) return;

      if (pip.playbackRate !== media.playbackRate) {
        pip.playbackRate = media.playbackRate;
      }
    };

    // --- ResizeObserver (Clamp + Mobile Scale) ---
    // Make sure we only use ResizeObserver if it's supported (for SSR/old browsers)
    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver((entries) => {
        const state = get() as unknown as MediaPipOverlayState;
        const entry = entries[0];
        if (!entry) return;

        const { width } = entry.contentRect;

        if (width < 640 && state.pipOverlayScale < 0.4) {
          set({ pipOverlayScale: 0.4 });
        }

        // Trigger a position re-clamp by re-applying the current position
        const { x, y } = state.pipOverlayPosition;
        state.setPipOverlayPosition(x, y);
      });

      resizeObserver.observe(container);
      signal.addEventListener('abort', () => resizeObserver.disconnect());
    }

    // --- Listeners ---
    listen(media, 'timeupdate', syncTime, { signal });

    listen(
      media,
      'seeked',
      () => {
        const pip = getPipMedia();
        if (pip) pip.currentTime = media.currentTime;
      },
      { signal }
    );

    listen(media, 'play', syncPlayState, { signal });
    listen(media, 'pause', syncPlayState, { signal });
    listen(media, 'playing', syncPlayState, { signal });
    listen(media, 'ratechange', syncRate, { signal });
  },
});
