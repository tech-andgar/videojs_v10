# PIP Overlay Implementation Plan

**Status:** PLANNED

Implementation plan for a custom draggable PIP overlay with synchronized time controls.

## Overview

Add a custom in-page Picture-in-Picture overlay that renders a secondary `<video>` as a draggable, resizable, responsive floating window inside the player container. The PIP video synchronizes play/pause/seek/playbackRate with the main video. Independent of the browser's native PIP API — does not modify `pipFeature`.

**Platform support:** HTML (web components) + React. React Native is out of scope (planned, not yet implemented in the monorepo).

## Architecture

```
                    createPlayer({ features: [...videoFeatures, pipOverlayFeature] })
                                          │
                           pipOverlayFeature (definePlayerFeature)
                                          │
                              selectPipOverlay (createSelector)
                                          │
               ┌──────────────────────────┼──────────────────────────┐
               │                                                     │
      HTML (Web Components)                                    React
               │                                                     │
    PlayerController + selectPipOverlay              usePlayer(selectPipOverlay)
               │                                                     │
    ┌──────────┼──────────┐                        ┌─────────┼─────────┐
    │          │          │                        │         │         │
<media-pip-  <media-pip-  <pip-source>        <PipOverlay>  <PipOverlay  usePipOverlay()
 overlay>    overlay-toggle>                               Toggle>     (hook)
```

### DI Pattern

The feature is composable via `createPlayer()` — users inject it when needed:

```ts
import { videoFeatures, pipOverlayFeature } from '@videojs/core/dom';

createPlayer({ features: [...videoFeatures, pipOverlayFeature] });
```

Not included in `videoFeatures` by default — opt-in only.

## Decisions

| Topic | Decision | Notes |
|-------|----------|-------|
| Source config | Hybrid (C) | Attribute `pip-src` + `<pip-source>` children + programmatic API |
| Time offset | None | PIP mirrors main video timestamp exactly |
| PIP controls | None | Silent sync — no play/pause/seek controls on PIP |
| Multiple PIPs | One (extensible) | Design for future multi-PIP but implement one |
| Position bounds | Constrained (configurable) | Restricted to container by default |
| Resize | Yes | Corner resize handles |
| Toggle button | Yes | Button in control bar |
| Multi-source/lang | Yes | `<pip-source lang="es" src="...">` children |
| Audio | Always muted | PIP `<video>` has `muted` attribute |
| Playback rate | Synced | PIP follows main video's `playbackRate` |
| Aspect ratio | Auto-detect | Read `videoWidth/videoHeight` on `loadedmetadata` |
| Loading state | Spinner (configurable) | Options: `spinner` / `black` / `poster` |
| Error handling | Show in overlay (configurable) | Configurable by admin/user |
| Keyboard shortcut | Configurable | Via `<media-hotkey keys="p" action="togglePipOverlay">` |
| Mobile (<640px) | Larger min scale | 40% instead of 28% |
| Native PIP coexistence | Both active | Overlay and native PIP can coexist |
| Fullscreen | PIP persists | Overlay stays visible in fullscreen |
| Snap-to-corner | No | Free position — stays where user drops it |
| Animation | Scale+fade (configurable) | Options: `scale-fade` / `fade` / `slide` / `none` |
| Accessibility | Full from start | ARIA roles, keyboard nav, focus management |
| Initial position | Bottom-right (configurable) | `{ x: 0.78, y: 0.72 }` default |
| CORS | Inherit from main | Fallback to own `crossorigin` attribute |

## Source Resolution Priority

```
1. Programmatic: showPipOverlay('url')     ← always wins (runtime override)
2. Children:     <pip-source src="...">    ← declarative multi-source
3. Attribute:    pip-src="..."             ← simplest case
```

## Synchronization

Main video → PIP video (unidirectional):

| Event | Action |
|-------|--------|
| `play` | `pipMedia.play()` |
| `pause` | `pipMedia.pause()` |
| `seeked` | `pipMedia.currentTime = media.currentTime` |
| `timeupdate` | if drift > 0.3s → `pipMedia.currentTime = media.currentTime` |
| `ratechange` | `pipMedia.playbackRate = media.playbackRate` |

The PIP `<video>` element is registered on the container via `Symbol('@videojs/pip-overlay-media')`.
The feature reads it during sync events.

---

## Phases

| # | Title | Package | Files | Status |
|---|-------|---------|-------|--------|
| 1 | Core State Interface | `@videojs/core` | 1 | `[ ]` |
| 2 | Store Feature | `@videojs/core` | 2 | `[ ]` |
| 3 | Selectors & Exports | `@videojs/core` | 2 | `[ ]` |
| 4 | PIP Overlay Element (HTML) | `@videojs/html` | 1 | `[ ]` |
| 5 | PIP Toggle Button Element (HTML) | `@videojs/html` | 1 | `[ ]` |
| 6 | PIP Source Element (HTML) | `@videojs/html` | 1 | `[ ]` |
| 7 | CSS Styles | `@videojs/skins` | 1 | `[ ]` |
| 8 | HTML Skin Integration | `@videojs/html` | 2 | `[ ]` |
| 9 | HTML Package Exports | `@videojs/html` | 1 | `[ ]` |
| 10 | React PipOverlay Component | `@videojs/react` | 1 | `[ ]` |
| 11 | React PipOverlayToggle Component | `@videojs/react` | 1 | `[ ]` |
| 12 | React usePipOverlay Hook | `@videojs/react` | 1 | `[ ]` |
| 13 | React Skin Integration | `@videojs/react` | 1 | `[ ]` |
| 14 | React Package Exports | `@videojs/react` | 1 | `[ ]` |
| 15 | HTML Sandbox Demo | `apps/sandbox` | 2 | `[ ]` |
| 16 | React Sandbox Demo | `apps/sandbox` | 2 | `[ ]` |
| 17 | Unit Tests | `@videojs/core` | 1 | `[ ]` |
| 18 | Verification | — | — | `[ ]` |

---

## Phase 1: Core State Interface

### `packages/core/src/core/media/state.ts`

Add at end of file:

```ts
export interface PipOverlaySource {
  src: string;
  lang?: string;
  label?: string;
}

export type PipOverlayLoadingState = 'spinner' | 'black' | 'poster';
export type PipOverlayAnimation = 'scale-fade' | 'fade' | 'slide' | 'none';

export interface MediaPipOverlayState {
  pipOverlayActive: boolean;
  pipOverlaySrc: string | null;
  pipOverlaySources: PipOverlaySource[];
  pipOverlayLang: string | null;
  pipOverlayPosition: { x: number; y: number };
  pipOverlayScale: number;
  pipOverlayConstrained: boolean;
  pipOverlayLoadingState: PipOverlayLoadingState;
  pipOverlayAnimation: PipOverlayAnimation;
  pipOverlayError: string | null;

  showPipOverlay(src?: string): void;
  hidePipOverlay(): void;
  togglePipOverlay(src?: string): void;
  setPipOverlayPosition(x: number, y: number): void;
  setPipOverlayScale(scale: number): void;
  setPipOverlaySources(sources: PipOverlaySource[]): void;
  setPipOverlayLang(lang: string): void;
  dismissPipOverlayError(): void;
}
```

---

## Phase 2: Store Feature

### `packages/core/src/dom/store/features/pip-overlay.ts` (new)

Feature responsibilities:
- **State**: position, scale, visibility, source, sources list, lang, loading, animation, error, constrained
- **Actions**: show/hide/toggle, position/scale setters, source/lang management, error dismiss
- **Attach**: listens to main media events for time/play/pause/rate sync
- Uses `PIP_OVERLAY_MEDIA_SYMBOL` to locate the PIP `<video>` on the container

```ts
export const PIP_OVERLAY_MEDIA_SYMBOL = Symbol('@videojs/pip-overlay-media');

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

    showPipOverlay(src?) {
      const state = get();
      const resolved = src ?? state.pipOverlaySrc ?? state.pipOverlaySources[0]?.src ?? null;
      if (resolved) set({ pipOverlayActive: true, pipOverlaySrc: resolved, pipOverlayError: null });
    },

    hidePipOverlay() { set({ pipOverlayActive: false }); },

    togglePipOverlay(src?) {
      if (get().pipOverlayActive) set({ pipOverlayActive: false });
      else get().showPipOverlay(src);
    },

    setPipOverlayPosition(x, y) {
      const { pipOverlayConstrained } = get();
      const clamp = (v: number) => pipOverlayConstrained ? Math.max(0, Math.min(1, v)) : v;
      set({ pipOverlayPosition: { x: clamp(x), y: clamp(y) } });
    },

    setPipOverlayScale(scale) {
      set({ pipOverlayScale: Math.max(0.15, Math.min(0.5, scale)) });
    },

    setPipOverlaySources(sources) {
      set({ pipOverlaySources: sources });
      if (!get().pipOverlaySrc && sources.length > 0) set({ pipOverlaySrc: sources[0].src });
    },

    setPipOverlayLang(lang) {
      const source = get().pipOverlaySources.find(s => s.lang === lang);
      if (source) set({ pipOverlayLang: lang, pipOverlaySrc: source.src });
    },

    dismissPipOverlayError() { set({ pipOverlayError: null }); },
  }),

  attach({ target, signal, get, set }) {
    const { media, container } = target;
    if (!container || !isMediaPauseCapable(media) || !isMediaSeekCapable(media)) return;

    const getPipMedia = (): HTMLVideoElement | null =>
      (container as any)[PIP_OVERLAY_MEDIA_SYMBOL] ?? null;

    const syncTime = () => {
      const pip = getPipMedia();
      if (!pip || !get().pipOverlayActive) return;
      if (Math.abs(pip.currentTime - media.currentTime) > 0.3) pip.currentTime = media.currentTime;
    };

    const syncPlayState = () => {
      const pip = getPipMedia();
      if (!pip || !get().pipOverlayActive) return;
      if (media.paused && !pip.paused) pip.pause();
      else if (!media.paused && pip.paused) pip.play().catch(() => {});
    };

    const syncRate = () => {
      const pip = getPipMedia();
      if (!pip || !get().pipOverlayActive) return;
      if (pip.playbackRate !== media.playbackRate) pip.playbackRate = media.playbackRate;
    };

    // Mobile scale adjustment
    if (container.clientWidth < 640 && get().pipOverlayScale < 0.4) {
      set({ pipOverlayScale: 0.4 });
    }

    listen(media, 'timeupdate', syncTime, { signal });
    listen(media, 'seeked', syncTime, { signal });
    listen(media, 'play', syncPlayState, { signal });
    listen(media, 'pause', syncPlayState, { signal });
    listen(media, 'playing', syncPlayState, { signal });
    listen(media, 'ratechange', syncRate, { signal });
  },
});
```

---

## Phase 3: Selectors & Exports

### `packages/core/src/dom/store/selectors.ts`

Add:

```ts
import { pipOverlayFeature } from './features/pip-overlay';

export const selectPipOverlay = createSelector(pipOverlayFeature);
```

### `packages/core/src/dom/store/features/index.ts`

Add:

```ts
export { pipOverlayFeature, PIP_OVERLAY_MEDIA_SYMBOL } from './pip-overlay';
```

---

## Phase 4: PIP Overlay Element

### `packages/html/src/ui/pip-overlay/pip-overlay-element.ts` (new)

`<media-pip-overlay>` — the overlay container.

**Responsibilities:**

1. Renders internal `<video muted playsinline>` for secondary source
2. Observes store via `PlayerController` + `selectPipOverlay`
3. Updates CSS custom properties: `--pip-x`, `--pip-y`, `--pip-scale`, `--pip-aspect`
4. Registers `<video>` on container via `PIP_OVERLAY_MEDIA_SYMBOL`
5. Drag: `pointerdown` → `setPointerCapture` → `pointermove` (delta as % of container) → `setPipOverlayPosition()` → `pointerup`
6. Resize: corner handles, same pointer pattern → `setPipOverlayScale()`
7. Close button: calls `hidePipOverlay()`
8. Auto-detect aspect ratio: `loadedmetadata` → `videoWidth/videoHeight` → `--pip-aspect`
9. Crossorigin: inherits from main `<video>`, fallback to own attribute
10. Error: listens to PIP `<video>` `error` event → sets `pipOverlayError`
11. Loading: sets `data-loading` until `canplay`

**Accessibility:**

- `role="region"` + `aria-label="Secondary video overlay"`
- Close button: `aria-label="Close secondary video"`
- Resize handles: `aria-hidden="true"` (pointer-only interaction)
- `tabindex="0"` — focusable with Tab
- `Escape` key closes when focused
- `data-active` / `data-dragging` / `data-resizing` / `data-loading` / `data-error` attributes

**Observed attributes:**

- `pip-src` — direct source (Hybrid option A path)
- `crossorigin` — CORS override
- `pip-loading` — `'spinner' | 'black' | 'poster'`
- `pip-animation` — `'scale-fade' | 'fade' | 'slide' | 'none'`
- `pip-position` — `'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'`
- `pip-constrained` — boolean

---

## Phase 5: PIP Toggle Button

### `packages/html/src/ui/pip-overlay/pip-overlay-toggle-element.ts` (new)

`<media-pip-overlay-toggle>` — control bar button.

- Extends `MediaButtonElement`
- Uses `selectPipOverlay` for state
- `activate()` → `togglePipOverlay()`
- `data-pip-overlay-active` for styling
- `pip-src` attribute for specifying source on the button
- `aria-label` dynamic: "Show/Hide secondary video"
- `aria-pressed` reflects active state

---

## Phase 6: PIP Source Element

### `packages/html/src/ui/pip-overlay/pip-source-element.ts` (new)

`<pip-source>` — declarative multi-language source element.

```html
<pip-source lang="es" label="Lengua de señas" src="sign-lang-es.mp4"></pip-source>
```

- Extends `HTMLElement` (lightweight, no ReactiveElement needed)
- Attributes: `src`, `lang`, `label`
- Observed by the skin/provider via `MutationObserver` or `slotchange`
- Populates `pipOverlaySources` in the store

---

## Phase 7: CSS

PIP overlay styles (inline in skin or `packages/skins/`):

```css
media-pip-overlay {
  position: absolute;
  z-index: 10;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  cursor: grab;
  left: calc(var(--pip-x, 0.78) * 100%);
  top: calc(var(--pip-y, 0.72) * 100%);
  width: calc(var(--pip-scale, 0.28) * 100%);
  aspect-ratio: var(--pip-aspect, 16 / 9);
  transform: translate(-50%, -50%);

  /* Default animation: scale-fade */
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.8);
  pointer-events: none;
  transition: opacity 0.25s ease, transform 0.25s ease;
}

media-pip-overlay[data-active] {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
  pointer-events: auto;
}

media-pip-overlay:active { cursor: grabbing; }

media-pip-overlay[data-dragging] {
  cursor: grabbing;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5), 0 0 0 2px rgba(255, 255, 255, 0.3);
  transition: none;
}

/* Close button */
media-pip-overlay .pip-overlay__close {
  position: absolute; top: 4px; right: 4px; z-index: 1;
  width: 24px; height: 24px; border-radius: 50%;
  background: rgba(0, 0, 0, 0.6); color: white; border: none;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.15s ease;
}

media-pip-overlay:hover .pip-overlay__close,
media-pip-overlay:focus-within .pip-overlay__close { opacity: 1; }

/* Resize handles */
media-pip-overlay .pip-overlay__resize {
  position: absolute; width: 14px; height: 14px;
  background: rgba(255, 255, 255, 0.3); border-radius: 2px;
  opacity: 0; transition: opacity 0.15s ease;
}

media-pip-overlay:hover .pip-overlay__resize,
media-pip-overlay:focus-within .pip-overlay__resize { opacity: 1; }

.pip-overlay__resize--se { bottom: 2px; right: 2px; cursor: nwse-resize; }
.pip-overlay__resize--sw { bottom: 2px; left: 2px; cursor: nesw-resize; }

/* Video */
media-pip-overlay video { width: 100%; height: 100%; object-fit: cover; display: block; }

/* Mobile */
@container (max-width: 640px) {
  media-pip-overlay { width: calc(var(--pip-scale-mobile, 0.4) * 100%); }
}
```

---

## Phase 8: Skin Integration

### `packages/html/src/define/video/skin.ts`

Add to template HTML:

```html
<!-- Before <media-controls> -->
<media-pip-overlay></media-pip-overlay>

<!-- Inside control bar button group, before <media-pip-button> -->
<media-pip-overlay-toggle commandfor="pip-overlay-tooltip"
  class="media-button media-button--subtle media-button--icon media-button--pip-overlay">
  ${renderIcon('pip-enter', { class: 'media-icon media-icon--pip-overlay-enter' })}
  ${renderIcon('pip-exit', { class: 'media-icon media-icon--pip-overlay-exit' })}
</media-pip-overlay-toggle>
<media-tooltip id="pip-overlay-tooltip" side="top" class="media-surface media-tooltip"></media-tooltip>
```

### `packages/html/src/define/video/ui.ts`

Add import for new elements so they auto-register:

```ts
import '../../ui/pip-overlay/pip-overlay-element';
import '../../ui/pip-overlay/pip-overlay-toggle-element';
import '../../ui/pip-overlay/pip-source-element';
```

---

## Phase 9: HTML Package Exports

### `packages/html/src/index.ts`

```ts
export { PipOverlayElement } from './ui/pip-overlay/pip-overlay-element';
export { PipOverlayToggleElement } from './ui/pip-overlay/pip-overlay-toggle-element';
export { PipSourceElement } from './ui/pip-overlay/pip-source-element';
```

---

## Phase 10: Sandbox Demo

### `apps/sandbox/src/html-pip-overlay/index.html` (new)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sandbox — HTML PIP Overlay</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

### `apps/sandbox/src/html-pip-overlay/main.ts` (new)

Demo with:
- Main video player with full controls
- `pip-src` pointing to secondary video
- PIP overlay toggle button in controls
- Hotkey `p` for toggle: `<media-hotkey keys="p" action="togglePipOverlay">`
- Multi-language demo with `<pip-source>` elements

---

## Phase 11: Unit Tests

### `packages/core/src/dom/store/features/tests/pip-overlay.test.ts` (new)

Tests to write:

- **State actions:**
  - `showPipOverlay()` sets active + resolves src
  - `hidePipOverlay()` clears active
  - `togglePipOverlay()` toggles
  - `setPipOverlayPosition()` clamps when constrained
  - `setPipOverlayScale()` clamps to 0.15-0.5
  - `setPipOverlaySources()` + auto-select first source
  - `setPipOverlayLang()` selects matching source
  - `dismissPipOverlayError()` clears error

- **Source resolution priority:**
  - Programmatic src wins over stored src
  - Stored src wins over sources[0]
  - No source → no-op

- **Sync (with mocked media):**
  - `timeupdate` → syncs PIP currentTime when drift > 0.3s
  - `seeked` → always syncs PIP currentTime
  - `play` → calls PIP play()
  - `pause` → calls PIP pause()
  - `ratechange` → syncs PIP playbackRate

- **Mobile:**
  - Container width < 640 → scale adjusts to 0.4

---

## Phase 10: React PipOverlay Component

### `packages/react/src/ui/pip-overlay/pip-overlay.tsx` (new)

`<PipOverlay>` — React equivalent of `<media-pip-overlay>`.

Follows the same pattern as other React UI components in the codebase:

```tsx
'use client';

import { selectPipOverlay } from '@videojs/core/dom';
import { usePlayer, useContainer } from '../../player/context';

export interface PipOverlayProps {
  className?: string;
  src?: string;
  crossOrigin?: string;
}

export function PipOverlay({ className, src, crossOrigin }: PipOverlayProps): ReactNode {
  const pipOverlay = usePlayer(selectPipOverlay);
  const container = useContainer();
  const videoRef = useRef<HTMLVideoElement>(null);

  // Register PIP video on container via symbol
  // Handle drag/resize via pointer events
  // Sync src, auto-detect aspect ratio
  // Render: <div role="region"> + <video muted playsinline> + close button + resize handles
  // ARIA: aria-label, tabIndex, Escape to close, focus management
}

export namespace PipOverlay {
  export type Props = PipOverlayProps;
}
```

**Key differences from HTML element:**
- Uses `usePlayer(selectPipOverlay)` instead of `PlayerController`
- Uses `useContainer()` to access the container for symbol registration
- Uses React refs for the internal `<video>` element
- Uses `useEffect` for lifecycle (register/unregister symbol, event listeners)
- Uses `useCallback` for drag/resize handlers
- Renders JSX directly instead of imperative DOM

---

## Phase 11: React PipOverlayToggle Component

### `packages/react/src/ui/pip-overlay/pip-overlay-toggle.tsx` (new)

`<PipOverlayToggle>` — React toggle button.

Follows the `createMediaButton` pattern but simplified since PipOverlay doesn't have a Core class:

```tsx
'use client';

import { selectPipOverlay } from '@videojs/core/dom';
import { usePlayer } from '../../player/context';
import type { UIComponentProps } from '../../utils/types';

export interface PipOverlayToggleProps extends UIComponentProps<'button'> {
  /** Source to show when toggling. Overrides store source. */
  src?: string;
}

export function PipOverlayToggle({ src, children, ...props }: PipOverlayToggleProps): ReactNode {
  const pipOverlay = usePlayer(selectPipOverlay);

  if (!pipOverlay) return null;

  const handleClick = () => pipOverlay.togglePipOverlay(src);

  return (
    <button
      type="button"
      aria-pressed={pipOverlay.pipOverlayActive}
      aria-label={pipOverlay.pipOverlayActive ? 'Hide secondary video' : 'Show secondary video'}
      onClick={handleClick}
      data-pip-overlay-active={pipOverlay.pipOverlayActive || undefined}
      {...props}
    >
      {children}
    </button>
  );
}

export namespace PipOverlayToggle {
  export type Props = PipOverlayToggleProps;
}
```

---

## Phase 12: React usePipOverlay Hook

### `packages/react/src/ui/pip-overlay/use-pip-overlay.ts` (new)

Convenience hook for programmatic access:

```tsx
import { selectPipOverlay } from '@videojs/core/dom';
import { usePlayer } from '../../player/context';
import type { MediaPipOverlayState } from '@videojs/core';

/** Access PIP overlay state and actions from within a Player Provider. */
export function usePipOverlay(): MediaPipOverlayState | undefined {
  return usePlayer(selectPipOverlay);
}
```

Usage:

```tsx
function MyComponent() {
  const pip = usePipOverlay();

  return (
    <button onClick={() => pip?.showPipOverlay('camera-2.mp4')}>
      Show Camera 2
    </button>
  );
}
```

---

## Phase 13: React Skin Integration

### `packages/react/src/presets/video/skin.tsx`

Add PipOverlay and PipOverlayToggle to the VideoSkin component:

```diff
+import { PipOverlay } from '@/ui/pip-overlay/pip-overlay';
+import { PipOverlayToggle } from '@/ui/pip-overlay/pip-overlay-toggle';

 // Inside VideoSkin, before <Controls.Root>:
+      <PipOverlay />

 // Inside control bar button group, before <PiPButton>:
+            <Tooltip.Root side="top">
+              <Tooltip.Trigger
+                render={
+                  <PipOverlayToggle className="media-button--pip-overlay" render={<Button />}>
+                    <PipEnterIcon className="media-icon media-icon--pip-overlay-enter" />
+                    <PipExitIcon className="media-icon media-icon--pip-overlay-exit" />
+                  </PipOverlayToggle>
+                }
+              />
+              <Tooltip.Popup className="media-surface media-tooltip" />
+            </Tooltip.Root>
```

---

## Phase 14: React Package Exports

### `packages/react/src/index.ts`

```diff
+export { PipOverlay, type PipOverlayProps } from './ui/pip-overlay/pip-overlay';
+export { PipOverlayToggle, type PipOverlayToggleProps } from './ui/pip-overlay/pip-overlay-toggle';
+export { usePipOverlay } from './ui/pip-overlay/use-pip-overlay';
```

---

## Phase 15: HTML Sandbox Demo

### `apps/sandbox/src/html-pip-overlay/` (new)

```
apps/sandbox/src/html-pip-overlay/
├── index.html
└── main.ts
```

HTML sandbox with `<video-player>`, `<video-skin pip-src="...">`, PIP overlay toggle, hotkey.

---

## Phase 16: React Sandbox Demo

### `apps/sandbox/src/react-pip-overlay/` (new)

```
apps/sandbox/src/react-pip-overlay/
├── index.html
└── main.tsx
```

React sandbox with `<VideoProvider>`, `<VideoSkin>`, `<PipOverlay>`, `<PipOverlayToggle>`, hotkey.

```tsx
import { videoFeatures, pipOverlayFeature } from '@videojs/core/dom';
import { createPlayer, Video, Hotkey } from '@videojs/react';
import { VideoSkin } from '@videojs/react/video';
import { PipOverlay, PipOverlayToggle } from '@videojs/react';

const { Provider, Container, usePlayer } = createPlayer({
  features: [...videoFeatures, pipOverlayFeature],
});

function App() {
  return (
    <Provider>
      <VideoSkin>
        <Video src="main.mp4" playsInline crossOrigin="anonymous" />
        <PipOverlay src="camera-2.mp4" />
        <Hotkey keys="p" action="togglePipOverlay" />
      </VideoSkin>
    </Provider>
  );
}
```

---

## Phase 17: Unit Tests

### `packages/core/src/dom/store/features/tests/pip-overlay.test.ts` (new)

Tests to write:

- **State actions:**
  - `showPipOverlay()` sets active + resolves src
  - `hidePipOverlay()` clears active
  - `togglePipOverlay()` toggles
  - `setPipOverlayPosition()` clamps when constrained
  - `setPipOverlayScale()` clamps to 0.15-0.5
  - `setPipOverlaySources()` + auto-select first source
  - `setPipOverlayLang()` selects matching source
  - `dismissPipOverlayError()` clears error

- **Source resolution priority:**
  - Programmatic src wins over stored src
  - Stored src wins over sources[0]
  - No source → no-op

- **Sync (with mocked media):**
  - `timeupdate` → syncs PIP currentTime when drift > 0.3s
  - `seeked` → always syncs PIP currentTime
  - `play` → calls PIP play()
  - `pause` → calls PIP pause()
  - `ratechange` → syncs PIP playbackRate

- **Mobile:**
  - Container width < 640 → scale adjusts to 0.4

---

## Phase 18: Verification

### Automated

```bash
pnpm -F @videojs/core test src/dom/store/features/tests/pip-overlay.test.ts
pnpm typecheck
pnpm lint
pnpm build:packages
```

### Manual — HTML

1. Open sandbox `html-pip-overlay`
2. Click PIP overlay toggle → secondary video appears with scale+fade animation
3. Drag overlay → repositions freely within container
4. Resize handles → overlay changes size (clamped 15%-50%)
5. Play/pause/seek main video → PIP syncs silently
6. Change playback rate → PIP follows
7. Click X → overlay hides with animation
8. Keyboard: Tab to overlay, Escape to close
9. Press `p` → toggle PIP overlay
10. Fullscreen → PIP persists
11. Resize browser to < 640px → PIP scale increases to 40%
12. Screen reader test → ARIA labels read correctly
13. Error source → error message shown in overlay
14. Test in Chrome, Firefox, Safari

### Manual — React

1. Open sandbox `react-pip-overlay`
2. Same verification steps as HTML
3. Verify React-specific: component re-renders correctly on state changes
4. Verify `usePipOverlay()` hook returns state
5. Verify `<PipOverlayToggle>` aria-pressed toggles

---

## Platform Coverage

| Platform | Package | Status | Notes |
|----------|---------|--------|-------|
| **Web (HTML)** | `@videojs/html` | Planned | Custom elements: `<media-pip-overlay>`, `<media-pip-overlay-toggle>`, `<pip-source>` |
| **React** | `@videojs/react` | Planned | Components: `<PipOverlay>`, `<PipOverlayToggle>`, `usePipOverlay()` hook |
| **React Native** | `@videojs/react-native` | Not planned | Package is not yet implemented in the monorepo. Can be added later — the core feature (`pipOverlayFeature`) is runtime-agnostic. |

The layered architecture makes platform support straightforward:

```
@videojs/core          ← pipOverlayFeature + selectPipOverlay (shared by ALL platforms)
  ├── @videojs/html    ← web component elements (HTML)
  ├── @videojs/react   ← React components + hooks (React)
  └── @videojs/react-native ← future (React Native)
```

---

## File Summary

| Action | File | Package |
|--------|------|---------|
| MODIFY | `src/core/media/state.ts` | `@videojs/core` |
| NEW | `src/dom/store/features/pip-overlay.ts` | `@videojs/core` |
| NEW | `src/dom/store/features/tests/pip-overlay.test.ts` | `@videojs/core` |
| MODIFY | `src/dom/store/features/index.ts` | `@videojs/core` |
| MODIFY | `src/dom/store/selectors.ts` | `@videojs/core` |
| NEW | `src/ui/pip-overlay/pip-overlay-element.ts` | `@videojs/html` |
| NEW | `src/ui/pip-overlay/pip-overlay-toggle-element.ts` | `@videojs/html` |
| NEW | `src/ui/pip-overlay/pip-source-element.ts` | `@videojs/html` |
| NEW | PIP overlay CSS | `@videojs/skins` or inline |
| MODIFY | `src/define/video/skin.ts` | `@videojs/html` |
| MODIFY | `src/define/video/ui.ts` | `@videojs/html` |
| MODIFY | `src/index.ts` | `@videojs/html` |
| NEW | `src/ui/pip-overlay/pip-overlay.tsx` | `@videojs/react` |
| NEW | `src/ui/pip-overlay/pip-overlay-toggle.tsx` | `@videojs/react` |
| NEW | `src/ui/pip-overlay/use-pip-overlay.ts` | `@videojs/react` |
| MODIFY | `src/presets/video/skin.tsx` | `@videojs/react` |
| MODIFY | `src/index.ts` | `@videojs/react` |
| NEW | `src/html-pip-overlay/` | `apps/sandbox` |
| NEW | `src/react-pip-overlay/` | `apps/sandbox` |
