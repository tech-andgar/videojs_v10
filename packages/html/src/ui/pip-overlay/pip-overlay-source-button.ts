import type { MediaPipOverlayState } from '@videojs/core';
import { selectPipOverlay } from '@videojs/core/dom';
import type { PropertyValues } from '@videojs/element';

import { PlayerController } from '../../player/player-controller';
import { MediaUIElement } from '../media-ui-element';

/**
 * Button that cycles through PIP overlay sources.
 */
export class PipOverlaySourceButton extends MediaUIElement<any> {
  static readonly tagName = 'media-pip-overlay-source-button';

  protected readonly core = {
    setMedia: () => {},
    getState: () => ({}),
  } as any;

  protected readonly stateAttrMap = {};

  protected readonly pipOverlay = new PlayerController(this, selectPipOverlay);
  protected readonly mediaState = new PlayerController(this, (state) => state);

  constructor() {
    super();
    this.addEventListener('click', () => this.#handleClick());
  }

  protected override update(changed: PropertyValues): void {
    super.update(changed);
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
