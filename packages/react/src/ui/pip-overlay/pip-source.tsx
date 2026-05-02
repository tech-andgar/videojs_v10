'use client';

import type { PipOverlaySource } from '@videojs/core';
import { selectPipOverlay } from '@videojs/core/dom';
import { useEffect } from 'react';
import { usePlayerContext } from '../../player/context';

export interface PipSourceProps extends PipOverlaySource {}

/**
 * Declarative source for the PIP overlay.
 * Registers itself with the closest PIP overlay feature.
 */
export function PipSource(props: PipSourceProps) {
  const { store } = usePlayerContext();
  const { src, lang, label } = props;

  useEffect(() => {
    const pip = selectPipOverlay(store.state);
    if (!pip) return;

    console.log('[react-pip-source] Registering:', src);
    pip.addPipOverlaySource({ src, lang, label });
    return () => {
      console.log('[react-pip-source] Unregistering:', src);
      pip.removePipOverlaySource(src);
    };
  }, [store, src, lang, label]);

  return null;
}

export namespace PipSource {
  export type Props = PipSourceProps;
}
