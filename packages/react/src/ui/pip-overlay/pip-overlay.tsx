'use client';

import { PIP_OVERLAY_MEDIA_SYMBOL } from '@videojs/core/dom';
import type { ReactNode } from 'react';
import { Children, isValidElement, useEffect, useRef, useState } from 'react';

import { useContainer, usePlayerContext } from '../../player/context';
import type { UIComponentProps } from '../../utils/types';
import { PipSource } from './pip-source';
import { usePipOverlay } from './use-pip-overlay';

export interface PipOverlayProps extends UIComponentProps<'div', undefined> {
  /**
   * Default source URL.
   * For multiple sources, use `<PipSource />` children.
   */
  pipSrc?: string | undefined;
  /** CORS setting for the secondary video. */
  crossOrigin?: string;
}

/**
 * A draggable and resizable PIP overlay for a secondary video stream.
 *
 * Must be placed inside a `<PlayerProvider>`.
 */
export function PipOverlay({
  pipSrc,
  crossOrigin,
  children,
  className,
  style,
  ...props
}: Readonly<PipOverlayProps>): ReactNode {
  const pip = usePipOverlay();
  const container = useContainer();
  const { store } = usePlayerContext();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [aspectRatio, setAspectRatio] = useState(16 / 9);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  // Sync sources from children
  useEffect(() => {
    if (!pip) return;

    const sources: any[] = [];
    Children.forEach(children, (child) => {
      if (isValidElement(child) && child.type === PipSource) {
        sources.push(child.props);
      }
    });

    if (sources.length > 0) {
      pip.setPipOverlaySources(sources);
    } else if (pipSrc) {
      pip.setPipOverlaySources([{ src: pipSrc }]);
    }
  }, [children, pipSrc, pip]);

  // Register video on container
  useEffect(() => {
    const el = videoRef.current;
    if (!container || !el) return;

    (container as any)[PIP_OVERLAY_MEDIA_SYMBOL] = el;
    return () => {
      if ((container as any)[PIP_OVERLAY_MEDIA_SYMBOL] === el) {
        delete (container as any)[PIP_OVERLAY_MEDIA_SYMBOL];
      }
    };
  }, [container]);

  // Sync src to video element
  useEffect(() => {
    const el = videoRef.current;
    if (el && pip?.pipOverlaySrc && el.src !== pip.pipOverlaySrc) {
      el.src = pip.pipOverlaySrc;
    }
  }, [pip?.pipOverlaySrc]);

  const handleLoadedMetadata = () => {
    const el = videoRef.current;
    if (el?.videoWidth && el.videoHeight) {
      setAspectRatio(el.videoWidth / el.videoHeight);
    }
  };

  // Drag & Resize Handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    const isResizeHandle = !!target.closest('.pip-overlay__resize');
    const overlay = overlayRef.current;
    const state = pip;

    if (!overlay || !container || !state) return;
    if (target.closest('.pip-overlay__close') || target.closest('.pip-overlay__gesture-prompt')) return;

    overlay.setPointerCapture(e.pointerId);

    if (isResizeHandle) setIsResizing(true);
    else setIsDragging(true);

    const startX = e.clientX;
    const startY = e.clientY;
    const startPosX = state.pipOverlayPosition.x;
    const startPosY = state.pipOverlayPosition.y;
    const startScale = state.pipOverlayScale;
    const rect = container.getBoundingClientRect();

    const onPointerMove = (moveEvt: PointerEvent) => {
      const deltaX = moveEvt.clientX - startX;
      const deltaY = moveEvt.clientY - startY;

      if (isResizeHandle) {
        const deltaScale = deltaX / rect.width;
        state.setPipOverlayScale(startScale + deltaScale);
      } else {
        const deltaPosX = deltaX / rect.width;
        const deltaPosY = deltaY / rect.height;
        state.setPipOverlayPosition(startPosX + deltaPosX, startPosY + deltaPosY);
      }
    };

    const onPointerUp = (upEvt: PointerEvent) => {
      overlay.releasePointerCapture(upEvt.pointerId);
      setIsDragging(false);
      setIsResizing(false);
      globalThis.removeEventListener('pointermove', onPointerMove);
      globalThis.removeEventListener('pointerup', onPointerUp);
    };

    globalThis.addEventListener('pointermove', onPointerMove);
    globalThis.addEventListener('pointerup', onPointerUp);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!pip) return;

    if (e.key === 'Escape') {
      pip.hidePipOverlay();
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
      pip.setPipOverlayScale(pip.pipOverlayScale + dx);
    } else {
      pip.setPipOverlayPosition(pip.pipOverlayPosition.x + dx, pip.pipOverlayPosition.y + dy);
    }
  };

  const handleGestureClick = () => {
    if (pip) {
      pip.resolvePipOverlayGesture();
      videoRef.current?.play().catch(() => {});
    }
  };

  if (!pip) return null;

  const combinedStyle: React.CSSProperties = {
    '--pip-x': pip.pipOverlayPosition.x,
    '--pip-y': pip.pipOverlayPosition.y,
    '--pip-scale': pip.pipOverlayScale,
    '--pip-aspect': aspectRatio,
    ...(typeof style === 'function' ? style(undefined as any) : style),
  } as React.CSSProperties;

  return (
    <section
      ref={overlayRef}
      aria-label="Secondary video overlay"
      {...props}
      className={typeof className === 'function' ? className(undefined as any) : className}
      style={combinedStyle}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      data-active={pip.pipOverlayActive || undefined}
      data-dragging={isDragging || undefined}
      data-resizing={isResizing || undefined}
      data-requires-gesture={pip.pipOverlayRequiresGesture || undefined}
      data-error={pip.pipOverlayError || undefined}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        crossOrigin={crossOrigin as any}
        onLoadedMetadata={handleLoadedMetadata}
        onError={() => pip.setPipOverlayError('Error loading secondary video')}
        // Sync buffering
        onWaiting={() => {
          (store.state as any).pause?.();
        }}
        onPlaying={() => {
          (store.state as any).play?.();
        }}
      />

      <button
        type="button"
        className="pip-overlay__close"
        aria-label="Close secondary video"
        onClick={(e) => {
          e.stopPropagation();
          pip.hidePipOverlay();
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {pip.pipOverlayRequiresGesture && (
        <button type="button" className="pip-overlay__gesture-prompt" onClick={handleGestureClick}>
          Tap to Play
        </button>
      )}

      <div className="vjs-sr-only" aria-live="polite">
        {pip.pipOverlayError || (pip.pipOverlayActive ? 'Secondary video active' : '')}
      </div>

      <div className="pip-overlay__resize pip-overlay__resize--se" aria-hidden="true" />
    </section>
  );
}

export namespace PipOverlay {
  export type Props = PipOverlayProps;
}
