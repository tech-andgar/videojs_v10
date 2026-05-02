'use client';

import type { MediaPipOverlayState } from '@videojs/core';
import { selectPipOverlay } from '@videojs/core/dom';

import { usePlayer } from '../../player/context';

/**
 * Access the PIP overlay state and actions from within a Player Provider.
 *
 * Re-renders when any PIP overlay state property changes.
 * Returns `undefined` if the PIP overlay feature is not enabled.
 */
export function usePipOverlay(): MediaPipOverlayState | undefined {
  return usePlayer(selectPipOverlay);
}
