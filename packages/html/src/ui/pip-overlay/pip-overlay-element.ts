import type { MediaPipOverlayState } from '@videojs/core';
import type { AnyPlayerStore } from '@videojs/core/dom';
import { PIP_OVERLAY_MEDIA_SYMBOL, selectPipOverlay } from '@videojs/core/dom';
import type { PropertyDeclarationMap, PropertyValues } from '@videojs/element';
import { ContextConsumer } from '@videojs/element/context';

import { containerContext, playerContext } from '../../player/context';
import { PlayerController } from '../../player/player-controller';
import { MediaElement } from '../media-element';
import type { PipSourceElement } from './pip-source-element';

const log = (...args: unknown[]) => {
  if (__DEV__) console.debug('[pip-overlay]', ...args);
};

export class PipOverlayElement extends MediaElement {
  static readonly tagName = 'media-pip-overlay';

  static override readonly properties: PropertyDeclarationMap = {
    pipSrc: { type: String, attribute: 'pip-src' },
    crossOrigin: { type: String, attribute: 'crossorigin' },
  };

  pipSrc?: string;
  crossOrigin?: string;

  protected readonly pipOverlay: PlayerController<AnyPlayerStore, MediaPipOverlayState | undefined> =
    new PlayerController(this, playerContext, selectPipOverlay);
  protected readonly player: ContextConsumer<typeof playerContext, this> = new ContextConsumer(this, {
    context: playerContext,
    subscribe: false,
  });
  protected readonly container: ContextConsumer<typeof containerContext, this> = new ContextConsumer(this, {
    context: containerContext,
    subscribe: true,
  });

  readonly #video: HTMLVideoElement;
  readonly #closeBtn: HTMLButtonElement;
  readonly #gestureBtn: HTMLButtonElement;
  readonly #ariaLive: HTMLDivElement;

  #disconnect: AbortController | null = null;
  #mutationObserver: MutationObserver | null = null;
  #bufferingTimer: ReturnType<typeof setTimeout> | null = null;
  #pausedByBuffering = false;
  #toggleButton: HTMLElement | null = null;
  #loadGeneration = 0;
  #dragPointerId: number | null = null;

  constructor() {
    super();

    // Internal video element
    this.#video = document.createElement('video');
    this.#video.muted = true;
    this.#video.playsInline = true;

    // Close button
    this.#closeBtn = document.createElement('button');
    this.#closeBtn.className = 'pip-overlay__close';
    this.#closeBtn.setAttribute('aria-label', 'Close secondary video');
    this.#closeBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

    // Gesture fallback UI
    this.#gestureBtn = document.createElement('button');
    this.#gestureBtn.className = 'pip-overlay__gesture-prompt';
    this.#gestureBtn.textContent = 'Tap to Play';
    this.#gestureBtn.style.display = 'none';

    // Aria live region
    this.#ariaLive = document.createElement('div');
    this.#ariaLive.setAttribute('aria-live', 'polite');
    this.#ariaLive.className = 'vjs-sr-only';

    // Resize handles
    const seHandle = document.createElement('div');
    seHandle.className = 'pip-overlay__resize pip-overlay__resize--se';
    seHandle.setAttribute('aria-hidden', 'true');

    this.append(this.#video, this.#closeBtn, this.#gestureBtn, this.#ariaLive, seHandle);

    this.setAttribute('role', 'region');
    this.setAttribute('aria-label', 'Secondary video overlay');
    this.setAttribute('tabindex', '-1');
  }

  setToggleButton(el: HTMLElement): void {
    this.#toggleButton = el;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.destroyed) return;

    log('connected');
    this.#disconnect = new AbortController();

    this.#closeBtn.addEventListener('click', this.#onCloseClick);
    this.#gestureBtn.addEventListener('click', this.#onGestureClick);
    this.addEventListener('pointerdown', this.#onPointerDown);
    this.addEventListener('keydown', this.#onKeyDown);

    this.#video.addEventListener('loadedmetadata', this.#onLoadedMetadata);
    this.#video.addEventListener('error', this.#onError);
    this.#video.addEventListener('waiting', this.#onWaiting);
    this.#video.addEventListener('playing', this.#onPlaying);

    this.#mutationObserver = new MutationObserver(() => this.#syncSourcesFromChildren());
    this.#mutationObserver.observe(this, { childList: true });

    this.#syncSourcesFromChildren();

    // Register the video element on the player container once it's available
    this.#registerMedia();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    log('disconnected');
    this.#disconnect?.abort();
    this.#disconnect = null;

    this.#mutationObserver?.disconnect();
    this.#mutationObserver = null;

    if (this.#bufferingTimer) {
      clearTimeout(this.#bufferingTimer);
      this.#bufferingTimer = null;
    }

    this.#closeBtn.removeEventListener('click', this.#onCloseClick);
    this.#gestureBtn.removeEventListener('click', this.#onGestureClick);
    this.removeEventListener('pointerdown', this.#onPointerDown);
    this.removeEventListener('keydown', this.#onKeyDown);

    this.#video.removeEventListener('loadedmetadata', this.#onLoadedMetadata);
    this.#video.removeEventListener('error', this.#onError);
    this.#video.removeEventListener('waiting', this.#onWaiting);
    this.#video.removeEventListener('playing', this.#onPlaying);

    this.#unregisterMedia();
  }

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);

    if (changed.has('pipSrc')) {
      this.#syncSourcesFromChildren(); // Re-eval attributes vs children
    }

    if (changed.has('crossOrigin')) {
      if (this.crossOrigin) {
        this.#video.crossOrigin = this.crossOrigin;
      } else {
        this.#video.removeAttribute('crossorigin');
      }
    }
  }

  protected override update(changed: PropertyValues): void {
    super.update(changed);

    this.#registerMedia();

    const state = this.pipOverlay.value;
    if (!state) return;

    if (state.pipOverlayActive) {
      log('show → src=%s pos=(%s,%s) scale=%s', state.pipOverlaySrc, state.pipOverlayPosition.x, state.pipOverlayPosition.y, state.pipOverlayScale);
      this.dataset.active = '';
    } else {
      log('hide');
      delete this.dataset.active;
      // Cancel drag if overlay was hidden while dragging
      if (this.#dragPointerId !== null) {
        log('drag cancelled — overlay hidden during drag');
        this.releasePointerCapture(this.#dragPointerId);
        this.#dragPointerId = null;
        delete this.dataset.dragging;
        delete this.dataset.resizing;
      }
    }

    if (state.pipOverlayRequiresGesture) {
      this.dataset.requiresGesture = '';
      this.#gestureBtn.style.display = 'flex';
    } else {
      delete this.dataset.requiresGesture;
      this.#gestureBtn.style.display = 'none';
    }

    if (state.pipOverlayError) {
      this.dataset.error = state.pipOverlayError;
    } else {
      delete this.dataset.error;
    }

    this.style.setProperty('--pip-x', state.pipOverlayPosition.x.toString());
    this.style.setProperty('--pip-y', state.pipOverlayPosition.y.toString());
    this.style.setProperty('--pip-scale', state.pipOverlayScale.toString());

    if (state.pipOverlaySrc && this.#video.getAttribute('src') !== state.pipOverlaySrc) {
      this.#loadGeneration++;
      const gen = this.#loadGeneration;
      log('src change gen=%d → %s', gen, state.pipOverlaySrc);
      // Release old buffers before loading new source
      this.#video.removeAttribute('src');
      this.#video.load();
      this.#video.src = state.pipOverlaySrc;
      this.#ariaLive.textContent = 'Secondary video source changed';
      // Store generation for stale-check in handlers
      this.#video.dataset.gen = String(gen);
    } else if (!state.pipOverlaySrc && this.#video.hasAttribute('src')) {
      log('src cleared — releasing buffers');
      // Overlay hidden - release buffers
      this.#video.removeAttribute('src');
      this.#video.load();
      delete this.#video.dataset.gen;
    }
  }

  #registerMedia() {
    const container = this.container.value?.container;
    if (container && !(container as any)[PIP_OVERLAY_MEDIA_SYMBOL]) {
      (container as unknown as Record<symbol, unknown>)[PIP_OVERLAY_MEDIA_SYMBOL] = this.#video;
    }
  }

  #unregisterMedia() {
    const container = this.container.value?.container;
    if (container && (container as any)[PIP_OVERLAY_MEDIA_SYMBOL] === this.#video) {
      delete (container as unknown as Record<symbol, unknown>)[PIP_OVERLAY_MEDIA_SYMBOL];
    }
  }

  #syncSourcesFromChildren() {
    const state = this.pipOverlay.value;
    if (!state) return;

    const sources = Array.from(this.querySelectorAll('pip-source')) as PipSourceElement[];
    if (sources.length > 0) {
      state.setPipOverlaySources(sources.map((s) => ({ src: s.src, lang: s.lang, label: s.label })));
    } else if (this.pipSrc) {
      state.setPipOverlaySources([{ src: this.pipSrc }]);
    } else {
      state.setPipOverlaySources([]);
    }
  }

  readonly #onCloseClick = (e: MouseEvent) => {
    e.stopPropagation();
    log('close button clicked');
    this.pipOverlay.value?.hidePipOverlay();
    this.#toggleButton?.focus();
  };

  readonly #onGestureClick = (e: MouseEvent) => {
    e.stopPropagation();
    log('gesture prompt clicked — resolving autoplay block');
    const state = this.pipOverlay.value;
    if (state) {
      state.resolvePipOverlayGesture();
      this.#video.play().catch(() => {});
    }
  };

  readonly #onPointerDown = (e: PointerEvent) => {
    if (e.target === this.#closeBtn || e.target === this.#gestureBtn) return;

    const state = this.pipOverlay.value;
    if (!state) return;

    const container = this.container.value?.container;
    if (!container) return;

    const target = e.target as HTMLElement;
    const isResize = target.classList.contains('pip-overlay__resize');

    this.setPointerCapture(e.pointerId);
    this.#dragPointerId = e.pointerId;

    if (isResize) {
      log('resize start');
      this.dataset.resizing = '';
    } else {
      log('drag start pos=(%s,%s)', state.pipOverlayPosition.x, state.pipOverlayPosition.y);
      this.dataset.dragging = '';
    }

    const startX = e.clientX;
    const startY = e.clientY;
    const startPosX = state.pipOverlayPosition.x;
    const startPosY = state.pipOverlayPosition.y;
    const startScale = state.pipOverlayScale;
    const rect = container.getBoundingClientRect();

    let rafId: number | null = null;
    let latestMoveEvt: PointerEvent | null = null;

    const onPointerMove = (moveEvt: PointerEvent) => {
      latestMoveEvt = moveEvt;
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!latestMoveEvt) return;
        const deltaX = latestMoveEvt.clientX - startX;
        const deltaY = latestMoveEvt.clientY - startY;

        if (isResize) {
          state.setPipOverlayScale(startScale + deltaX / rect.width);
        } else {
          state.setPipOverlayPosition(startPosX + deltaX / rect.width, startPosY + deltaY / rect.height);
        }
      });
    };

    const onPointerUp = (upEvt: PointerEvent) => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      log(isResize ? 'resize end scale=%s' : 'drag end pos=(%s,%s)', isResize ? state.pipOverlayScale : state.pipOverlayPosition.x, isResize ? '' : state.pipOverlayPosition.y);
      this.releasePointerCapture(upEvt.pointerId);
      this.#dragPointerId = null;
      delete this.dataset.dragging;
      delete this.dataset.resizing;
      this.removeEventListener('pointermove', onPointerMove);
      this.removeEventListener('pointerup', onPointerUp);
    };

    // Pointer capture routes pointermove/pointerup to this element
    this.addEventListener('pointermove', onPointerMove);
    this.addEventListener('pointerup', onPointerUp);
  };

  readonly #onKeyDown = (e: KeyboardEvent) => {
    const state = this.pipOverlay.value;
    if (!state) return;

    if (e.key === 'Escape') {
      e.stopPropagation();
      state.hidePipOverlay();
      this.#toggleButton?.focus();
      return;
    }

    const step = 0.05;
    let dx = 0;
    let dy = 0;

    switch (e.key) {
      case 'ArrowUp':
        dy = -step;
        break;
      case 'ArrowDown':
        dy = step;
        break;
      case 'ArrowLeft':
        dx = -step;
        break;
      case 'ArrowRight':
        dx = step;
        break;
      default:
        return;
    }

    e.preventDefault();

    if (e.shiftKey) {
      // Resize
      state.setPipOverlayScale(state.pipOverlayScale + dx);
    } else {
      // Move
      state.setPipOverlayPosition(state.pipOverlayPosition.x + dx, state.pipOverlayPosition.y + dy);
    }
  };

  readonly #onLoadedMetadata = () => {
    const currentGen = this.#video.dataset.gen;
    if (currentGen !== String(this.#loadGeneration)) {
      log('loadedmetadata ignored — stale gen=%s current=%d', currentGen, this.#loadGeneration);
      return;
    }
    if (this.#video.videoWidth && this.#video.videoHeight) {
      const ratio = this.#video.videoWidth / this.#video.videoHeight;
      log('loadedmetadata %dx%d → aspect=%s', this.#video.videoWidth, this.#video.videoHeight, ratio.toFixed(3));
      this.style.setProperty('--pip-aspect', ratio.toString());
    }
  };

  readonly #onError = () => {
    const state = this.pipOverlay.value;
    if (!state) return;

    const code = this.#video.error?.code;
    const message = this.#video.error?.message ?? 'unknown';
    log('video error code=%s message=%s src=%s', code, message, this.#video.src);

    if (__DEV__ && code === MediaError.MEDIA_ERR_DECODE) {
      console.warn('[pip-overlay] MEDIA_ERR_DECODE on PIP video. On iOS Safari this may indicate the hardware video decoder limit has been reached. Consider reducing concurrent video elements.');
    }

    const msg = 'Error loading secondary video';
    state.setPipOverlayError(msg);
    this.#ariaLive.textContent = msg;
  };

  readonly #onWaiting = () => {
    log('pip buffering — starting 500ms pause debounce');
    if (this.#bufferingTimer) return;
    this.#bufferingTimer = setTimeout(() => {
      this.#bufferingTimer = null;
      const store = this.player.value;
      if (store && this.pipOverlay.value?.pipOverlayActive) {
        log('pip still buffering after 500ms — pausing main');
        (store.state as unknown as { pause(): void }).pause();
        this.#pausedByBuffering = true;
      }
    }, 500);
  };

  readonly #onPlaying = () => {
    if (this.#bufferingTimer) {
      log('pip recovered within 500ms — cancelled main pause');
      clearTimeout(this.#bufferingTimer);
      this.#bufferingTimer = null;
      return;
    }
    if (this.#pausedByBuffering) {
      log('pip resumed — resuming main');
      this.#pausedByBuffering = false;
      const store = this.player.value;
      if (store) {
        (store.state as unknown as { play(): Promise<void> }).play().catch(() => {});
      }
    }
  };
}
