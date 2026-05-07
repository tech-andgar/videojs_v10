import type { MediaPipOverlayState } from '@videojs/core';
import type { AnyPlayerStore } from '@videojs/core/dom';
import { selectPipOverlay } from '@videojs/core/dom';
import type { PropertyValues } from '@videojs/element';

import { playerContext } from '../../player/context';
import { PlayerController } from '../../player/player-controller';
import { MediaElement } from '../media-element';

/**
 * Button that cycles through PIP overlay sources.
 */
export class PipOverlaySourceButton extends MediaElement {
  static readonly tagName = 'media-pip-overlay-source-button';

  protected readonly pipOverlay: PlayerController<AnyPlayerStore, MediaPipOverlayState | undefined> =
    new PlayerController(this, playerContext, selectPipOverlay);

  constructor() {
    super();
    this.addEventListener('click', () => this.#handleClick());
  }

  protected override update(_changed: PropertyValues): void {
    super.update(_changed);
    const state = this.pipOverlay.value;
    if (!state || state.pipOverlaySources.length <= 1) {
      this.style.display = 'none';
    } else {
      this.style.display = '';
      this.setAttribute('aria-label', `Switch PIP Source (Current: ${state.pipOverlayLang || 'Default'})`);
    }
  }

  #handleClick() {
    const state = this.pipOverlay.value;
    if (!state || state.pipOverlaySources.length <= 1) return;

    const currentIndex = state.pipOverlaySources.findIndex((s) => s.src === state.pipOverlaySrc);
    const nextIndex = (currentIndex + 1) % state.pipOverlaySources.length;
    const nextSource = state.pipOverlaySources[nextIndex];

    if (nextSource) {
      state.setPipOverlaySrc(nextSource.src);
    }
  }
}
