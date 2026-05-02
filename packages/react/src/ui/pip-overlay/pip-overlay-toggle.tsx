'use client';

import type { ReactNode } from 'react';

import type { UIComponentProps } from '../../utils/types';
import { usePipOverlay } from './use-pip-overlay';

export interface PipOverlayToggleProps extends UIComponentProps<'button', undefined> {
  /**
   * Source URL to toggle. If not provided, it will use the current PIP source
   * or the first available source from the store.
   */
  src?: string;
}

/**
 * A button that toggles the custom PIP overlay.
 *
 * It automatically updates its `aria-pressed` state and `data-pip-overlay-active`
 * attribute based on the current PIP state.
 */
export function PipOverlayToggle({ src, children, className, style, ...props }: PipOverlayToggleProps): ReactNode {
  const pip = usePipOverlay();

  if (!pip) return null;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    props.onClick?.(e);
    pip.togglePipOverlay(src);
  };

  const active = pip.pipOverlayActive;
  const state = undefined;

  const resolvedClassName = typeof className === 'function' ? className(state as any) : className;
  const resolvedStyle = typeof style === 'function' ? style(state as any) : style;

  return (
    <button
      type="button"
      {...props}
      className={resolvedClassName}
      style={resolvedStyle}
      onClick={handleClick}
      aria-pressed={active}
      aria-label={active ? 'Hide secondary video' : 'Show secondary video'}
      data-pip-overlay-active={active || undefined}
    >
      {children}
    </button>
  );
}

export namespace PipOverlayToggle {
  export type Props = PipOverlayToggleProps;
}
