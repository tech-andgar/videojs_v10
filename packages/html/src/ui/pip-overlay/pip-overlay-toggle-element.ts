import type { MediaPipOverlayState } from '@videojs/core';
import type { AnyPlayerStore } from '@videojs/core/dom';
import { applyElementProps, selectPipOverlay } from '@videojs/core/dom';
import type { PropertyDeclarationMap, PropertyValues } from '@videojs/element';

import { playerContext } from '../../player/context';
import { PlayerController } from '../../player/player-controller';
import { MediaElement } from '../media-element';

export class PipOverlayToggleElement extends MediaElement {
  static readonly tagName = 'media-pip-overlay-toggle';

  static override readonly properties: PropertyDeclarationMap = {
    src: { type: String },
  };

  src?: string;

  protected readonly pipOverlay: PlayerController<AnyPlayerStore, MediaPipOverlayState | undefined> =
    new PlayerController(this, playerContext, selectPipOverlay);

  #disconnect: AbortController | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.destroyed) return;

    this.#disconnect = new AbortController();

    this.setAttribute('role', 'button');
    this.setAttribute('tabindex', '0');

    this.addEventListener('click', this.#onClick);
    this.addEventListener('keydown', this.#onKeyDown);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#disconnect?.abort();
    this.#disconnect = null;
    this.removeEventListener('click', this.#onClick);
    this.removeEventListener('keydown', this.#onKeyDown);
  }

  protected override update(changed: PropertyValues): void {
    super.update(changed);

    const pip = this.pipOverlay.value;
    if (!pip) return;

    const active = pip.pipOverlayActive;

    applyElementProps(this, {
      'aria-pressed': active ? 'true' : 'false',
      'aria-label': active ? 'Hide secondary video' : 'Show secondary video',
      'data-pip-overlay-active': active ? '' : undefined,
    });
  }

  readonly #onClick = () => {
    const pip = this.pipOverlay.value;
    if (pip) {
      pip.togglePipOverlay(this.src);
    }
  };

  readonly #onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.#onClick();
    }
  };
}
