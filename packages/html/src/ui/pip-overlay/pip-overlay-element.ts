import type { MediaPipOverlayState } from '@videojs/core';
import type { AnyPlayerStore } from '@videojs/core/dom';
import { PIP_OVERLAY_MEDIA_SYMBOL, selectPipOverlay } from '@videojs/core/dom';
import type { PropertyDeclarationMap, PropertyValues } from '@videojs/element';
import { ContextConsumer } from '@videojs/element/context';

import { containerContext, playerContext } from '../../player/context';
import { PlayerController } from '../../player/player-controller';
import { MediaElement } from '../media-element';
import type { PipSourceElement } from './pip-source-element';

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
    this.setAttribute('tabindex', '0');
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.destroyed) return;

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
    this.#disconnect?.abort();
    this.#disconnect = null;

    this.#mutationObserver?.disconnect();
    this.#mutationObserver = null;

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
      this.dataset.active = '';
    } else {
      delete this.dataset.active;
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

    if (state.pipOverlaySrc && this.#video.src !== state.pipOverlaySrc) {
      // Need to resolve to absolute URL for accurate comparison, but for simplicity:
      const current = this.#video.getAttribute('src');
      if (current !== state.pipOverlaySrc) {
        this.#video.src = state.pipOverlaySrc;
        this.#ariaLive.textContent = 'Secondary video source changed';
      }
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
    this.pipOverlay.value?.hidePipOverlay();
  };

  readonly #onGestureClick = (e: MouseEvent) => {
    e.stopPropagation();
    const state = this.pipOverlay.value;
    if (state) {
      state.resolvePipOverlayGesture();
      this.#video.play().catch(() => {});
    }
  };

  readonly #onPointerDown = (e: PointerEvent) => {
    if (e.target === this.#closeBtn || e.target === this.#gestureBtn) return;

    const target = e.target as HTMLElement;
    const isResize = target.classList.contains('pip-overlay__resize');

    this.setPointerCapture(e.pointerId);
    if (isResize) {
      this.dataset.resizing = '';
    } else {
      this.dataset.dragging = '';
    }

    const container = this.container.value?.container;
    if (!container) return;

    const startX = e.clientX;
    const startY = e.clientY;

    const state = this.pipOverlay.value;
    if (!state) return;

    const startPosX = state.pipOverlayPosition.x;
    const startPosY = state.pipOverlayPosition.y;
    const startScale = state.pipOverlayScale;

    const rect = container.getBoundingClientRect();

    const onPointerMove = (moveEvt: PointerEvent) => {
      const deltaX = moveEvt.clientX - startX;
      const deltaY = moveEvt.clientY - startY;

      if (isResize) {
        // Simple scale calculation based on X movement
        const deltaScale = deltaX / rect.width;
        state.setPipOverlayScale(startScale + deltaScale);
      } else {
        const deltaPosX = deltaX / rect.width;
        const deltaPosY = deltaY / rect.height;
        state.setPipOverlayPosition(startPosX + deltaPosX, startPosY + deltaPosY);
      }
    };

    const onPointerUp = (upEvt: PointerEvent) => {
      this.releasePointerCapture(upEvt.pointerId);
      delete this.dataset.dragging;
      delete this.dataset.resizing;
      globalThis.removeEventListener('pointermove', onPointerMove);
      globalThis.removeEventListener('pointerup', onPointerUp);
    };

    globalThis.addEventListener('pointermove', onPointerMove);
    globalThis.addEventListener('pointerup', onPointerUp);
  };

  readonly #onKeyDown = (e: KeyboardEvent) => {
    const state = this.pipOverlay.value;
    if (!state) return;

    if (e.key === 'Escape') {
      state.hidePipOverlay();
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
    if (this.#video.videoWidth && this.#video.videoHeight) {
      const ratio = this.#video.videoWidth / this.#video.videoHeight;
      this.style.setProperty('--pip-aspect', ratio.toString());
    }
  };

  readonly #onError = () => {
    const state = this.pipOverlay.value;
    if (state) {
      const msg = 'Error loading secondary video';
      state.setPipOverlayError(msg);
      this.#ariaLive.textContent = msg;
    }
  };

  readonly #onWaiting = () => {
    const store = this.player.value;
    if (store) {
      (store.state as unknown as { pause(): void }).pause();
    }
  };

  readonly #onPlaying = () => {
    const store = this.player.value;
    if (store) {
      (store.state as unknown as { play(): Promise<void> }).play().catch(() => {});
    }
  };
}
