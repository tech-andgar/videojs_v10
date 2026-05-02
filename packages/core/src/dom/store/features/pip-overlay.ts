import { listen } from '@videojs/utils/dom';

import type { MediaPipOverlayState } from '../../../core/media/state';
import { definePlayerFeature } from '../../feature';
import { isMediaPauseCapable, isMediaPlaybackRateCapable, isMediaSeekCapable } from '../../media/predicate';

export const PIP_OVERLAY_MEDIA_SYMBOL = Symbol('@videojs/pip-overlay-media');

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'blob:']);

function isAllowedSrc(src: string): boolean {
  try {
    const url = new URL(src, globalThis.location?.href);
    return ALLOWED_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

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
      if (resolved) {
        if (!isAllowedSrc(resolved)) {
          if (__DEV__) console.warn(`[pip-overlay] Blocked unsafe src: ${resolved}`);
          set({ pipOverlayError: 'Invalid source URL' });
          return;
        }
        set({ pipOverlayActive: true, pipOverlaySrc: resolved, pipOverlayError: null });
      }
    },

    hidePipOverlay() {
      set({ pipOverlayActive: false });
    },

    togglePipOverlay(src?) {
      const state = get() as unknown as MediaPipOverlayState;
      if (state.pipOverlayActive) {
        set({ pipOverlayActive: false });
      } else {
        state.showPipOverlay(src);
      }
    },

    setPipOverlayPosition(x, y) {
      const state = get() as unknown as MediaPipOverlayState;
      const clamp = (v: number) => (state.pipOverlayConstrained ? Math.max(0, Math.min(1, v)) : v);
      set({ pipOverlayPosition: { x: clamp(x), y: clamp(y) } });
    },

    setPipOverlayScale(scale) {
      set({ pipOverlayScale: Math.max(0.15, Math.min(0.5, scale)) });
    },

    setPipOverlaySources(sources) {
      const safe = sources.filter((s) => isAllowedSrc(s.src));
      if (__DEV__ && safe.length < sources.length) {
        console.warn('[pip-overlay] Filtered unsafe source URLs');
      }
      set({ pipOverlaySources: safe });
      const state = get() as unknown as MediaPipOverlayState;
      if (!state.pipOverlaySrc && safe.length > 0 && safe[0]) {
        set({ pipOverlaySrc: safe[0].src });
      }
    },

    setPipOverlayLang(lang) {
      const state = get() as unknown as MediaPipOverlayState;
      const source = state.pipOverlaySources.find((s) => s.lang === lang);
      if (source) {
        set({ pipOverlayLang: lang, pipOverlaySrc: source.src });
      }
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
        pip.currentTime = media.currentTime; // Hard sync for large drift
      } else if (absDrift > 0.3) {
        // Soft sync via rate
        const baseRate = media.playbackRate;
        pip.playbackRate = drift > 0 ? baseRate * 0.9 : baseRate * 1.1;
      } else if (pip.playbackRate !== media.playbackRate) {
        pip.playbackRate = media.playbackRate; // Restore normal rate
      }
    };

    const syncPlayState = () => {
      const pip = getPipMedia();
      const state = get() as unknown as MediaPipOverlayState;
      if (!pip || !state.pipOverlayActive) return;

      if (media.paused && !pip.paused) {
        pip.pause();
      } else if (!media.paused && pip.paused) {
        pip.play().catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'NotAllowedError') {
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
        const state = get() as unknown as MediaPipOverlayState;
        if (pip && state.pipOverlayActive) pip.currentTime = media.currentTime;
      },
      { signal }
    );

    listen(media, 'play', syncPlayState, { signal });
    listen(media, 'pause', syncPlayState, { signal });
    listen(media, 'playing', syncPlayState, { signal });
    listen(media, 'ratechange', syncRate, { signal });
  },
});
