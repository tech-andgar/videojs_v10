# PIP Overlay Implementation Plan

**Status:** COMPLETED

Implementation plan for a custom draggable PIP overlay with synchronized time controls.

## Overview

Add a custom in-page Picture-in-Picture overlay that renders a secondary `<video>` as a draggable, resizable, responsive floating window inside the player container. The PIP video synchronizes play/pause/seek/playbackRate with the main video. Independent of the browser's native PIP API — does not modify `pipFeature`.

**Platform support:** HTML (web components) + React. React Native is out of scope (planned, not yet implemented in the monorepo).

## Required Skills

Before implementing this plan, the following skills must be loaded/referenced to ensure alignment with Video.js v10 architecture and conventions:

- **Store & Features:** Load `api/SKILL.md` (for `definePlayerFeature` and state patterns).
- **UI Components:** Load `component/SKILL.md` (for HTML web components, React components, and styling conventions).
- **Accessibility:** Load `aria/SKILL.md` (for keyboard navigation, focus management, and `aria-live` implementation).
- **Media Synchronization:** Load `media-sync/SKILL.md` (for soft sync via playbackRate, bi-directional buffering, and Autoplay Policy fallback UI).

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

### Core Behavior

| Topic | Decision | Notes |
|-------|----------|-------|
| Source config | Hybrid (C) | Attribute `pip-src` + `<pip-source>` children + programmatic API |
| Multi-source/lang | Yes | `<pip-source data-lang="es" src="...">` children. Uses `data-lang` (not `lang`) to avoid semantic conflict with HTML `lang` attribute. |
| Audio | Always muted | User's responsibility to provide audio-less video file to save bandwidth. |
| PIP controls | None | Silent sync — no play/pause/seek controls on PIP |
| Multiple PIPs | One (v1 tradeoff) | Singular state shape (`pipOverlaySrc`, `pipOverlayPosition`). Multi-PIP would require array-based state redesign. |
| Native PIP coexistence | Both active | Overlay and native PIP can coexist |
| Toggle button | Yes | Button in control bar |
| Keyboard shortcut | Configurable | Via `<media-hotkey keys="p" action="togglePipOverlay">` |

### Layout & Interaction

| Topic | Decision | Notes |
|-------|----------|-------|
| Position bounds | Constrained | Restricted to container. Clamps on resize. |
| Initial position | Bottom-right | `{ x: 0.78, y: 0.72 }` default. Flips in RTL via `isRTL()`. |
| Snap-to-corner | No | Free position — stays where user drops it |
| Resize | Yes | Corner resize handles |
| Min overlay size | 160px minimum | Prevents unreadable gesture prompt on small containers (<320px). |
| Aspect ratio | Auto-detect | `videoWidth/videoHeight` on `loadedmetadata`. Default `16/9` until loaded. No layout jump on error. |
| Animation | Scale+fade (configurable) | Options: `scale-fade` / `fade` / `slide` / `none` |
| Loading state | Spinner | Options: `spinner` / `black` / `poster` |
| Error handling | Show in overlay | Configurable by admin/user |

### Synchronization

| Topic | Decision | Notes |
|-------|----------|-------|
| Time sync | Soft Catch-up | `playbackRate` for drifts 0.3s–2s. Hard `seek` for > 2s. |
| Buffering sync | Bi-directional (debounced) | 500ms threshold before pausing main. Cancel if PIP recovers within window. |
| Autoplay Policy | Fallback UI | PIP shows "Tap to Play" overlay button on `NotAllowedError`. Main continues. |
| Live streams | Skip sync | `duration === Infinity` → no drift calc. PIP plays independently from live edge. |
| Page visibility | Hard re-sync | On `visibilitychange` → `visible`, force `currentTime` + `playbackRate` sync. |
| DRM content | Not supported | `__DEV__` warning if main uses `mediaKeys`. Document limitation. |

### Security

| Topic | Decision | Notes |
|-------|----------|-------|
| URL sanitization | Allowlist | Only `http:`, `https:`, `blob:` URIs. Reject `javascript:`, `data:`. Validate in `showPipOverlay()` and `setPipOverlaySources()`. |
| CORS | Inherit from main | Fallback to own `crossorigin` attribute. |
| CORS error messaging | Opaque-aware | Generic "Failed to load secondary video" + `__DEV__` console suggestion to check CORS headers. |

### Accessibility

| Topic | Decision | Notes |
|-------|----------|-------|
| ARIA | Advanced | `role="region"`, `aria-live` announcements, keyboard drag/resize. |
| Focus order | After controls | `tabindex="-1"`. Focus via toggle button activation only. Escape returns focus to toggle. |
| Escape key | Overlay-scoped | `stopPropagation()` — does not exit fullscreen. |
| aria-live strings | Defined | "Secondary video opened", "Secondary video closed", "Secondary video error: {message}", "Secondary video resumed". |
| Reduced motion | Respect | `@media (prefers-reduced-motion: reduce)`: disable all transitions/animations. WCAG 2.3.3. |
| Forced colors | System colors | `@media (forced-colors: active)`: `ButtonText`, `Canvas` for interactive elements. |
| RTL support | Position flip | Default x flips. Arrow key movement flips horizontal direction. |

### Mobile & Platform

| Topic | Decision | Notes |
|-------|----------|-------|
| Mobile (<640px) | Larger min scale | 40% instead of 28% |
| Touch close | Hybrid auto-detect | `@media (hover: none)`: always visible. `@media (hover: hover)`: reveal on hover/focus-within. |
| Fullscreen | Container forced | When PIP active, never fall back to `webkitSetPresentationMode`. Prevents iOS Safari DOM removal. |
| iOS video limit | Detect + warn | `__DEV__` warning on `MEDIA_ERR_DECODE`. Hardware limit, no runtime workaround. |
| Orientation change | Re-clamp | ResizeObserver + `requestAnimationFrame` for post-rotation position clamp. |
| ResizeObserver | Yes | Container size dictates mobile scale and dynamic position clamping. |

### Performance & Stability

| Topic | Decision | Notes |
|-------|----------|-------|
| Memory cleanup | Explicit release | On source change/hide: clear src + `load()` to release buffers. |
| Load abort | Cancel pending | Clear src before setting new src on rapid toggle. |
| Source load race | Generation counter | Increment on source change. Ignore stale load completions. |
| Drag perf | rAF batching | Batch `pointermove` via `requestAnimationFrame`. Prevents 120Hz+ layout thrashing. |
| Drag cancellation | Auto-cancel | Release pointer capture if `pipOverlayActive` becomes `false` during drag. |

## Source Resolution Priority

```
1. Programmatic: showPipOverlay('url')     ← always wins (runtime override)
2. Children:     <pip-source src="...">    ← declarative multi-source
3. Attribute:    pip-src="..."             ← simplest case
```

## Synchronization

Main video ↔ PIP video. PIP `<video>` registered on container via `Symbol('@videojs/pip-overlay-media')`.

| Event | Action | Condition |
|-------|--------|-----------|
| `play` | `pipMedia.play().catch(showUnlockButton)` | — |
| `pause` | `pipMedia.pause()` | — |
| `seeked` | `pipMedia.currentTime = media.currentTime` | VOD only (skip if live) |
| `timeupdate` | Soft sync: adjust `playbackRate` ±10% | Drift 0.3s–2s, VOD only |
| `timeupdate` | Hard sync: force `currentTime` | Drift > 2s, VOD only |
| `ratechange` | `pipMedia.playbackRate = media.playbackRate` | — |
| `pipMedia:waiting` | `media.pause()` after 500ms debounce | Cancel if PIP recovers within threshold |
| `pipMedia:playing` | `media.play()` | Only if main was paused by buffering sync |
| `visibilitychange` | Hard re-sync `currentTime` + `playbackRate` | On tab return, VOD only |
| `duration === Infinity` | Skip all drift-based sync | Live streams |

---

## Phases

| # | Title | Package | Files | Status |
|---|-------|---------|-------|--------|
| 1 | Core State Interface | `@videojs/core` | 1 | `[x]` |
| 2 | Store Feature | `@videojs/core` | 2 | `[x]` |
| 3 | Selectors & Exports | `@videojs/core` | 2 | `[x]` |
| 4 | PIP Overlay Element (HTML) | `@videojs/html` | 1 | `[x]` |
| 5 | PIP Toggle Button Element (HTML) | `@videojs/html` | 1 | `[x]` |
| 6 | PIP Source Element (HTML) | `@videojs/html` | 1 | `[x]` |
| 7 | CSS Styles | `@videojs/skins` | 1 | `[x]` |
| 8 | HTML Skin Integration | `@videojs/html` | 2 | `[x]` |
| 9 | HTML Package Exports | `@videojs/html` | 1 | `[x]` |
| 10 | React PipOverlay Component | `@videojs/react` | 1 | `[x]` |
| 11 | React PipOverlayToggle Component | `@videojs/react` | 1 | `[x]` |
| 12 | React usePipOverlay Hook | `@videojs/react` | 1 | `[x]` |
| 13 | React Skin Integration | `@videojs/react` | 1 | `[x]` |
| 14 | React Package Exports | `@videojs/react` | 1 | `[x]` |
| 15 | HTML Sandbox Demo | `apps/sandbox` | 2 | `[x]` |
| 16 | React Sandbox Demo | `apps/sandbox` | 2 | `[x]` |
| 17 | Unit Tests | `@videojs/core` | 1 | `[x]` |
| 18 | Verification | — | — | `[x]` |

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
  pipOverlayRequiresGesture: boolean; // Autoplay policy block state

  showPipOverlay(src?: string): void;
  hidePipOverlay(): void;
  togglePipOverlay(src?: string): void;
  setPipOverlayPosition(x: number, y: number): void;
  setPipOverlayScale(scale: number): void;
  setPipOverlaySources(sources: PipOverlaySource[]): void;
  setPipOverlayLang(lang: string): void;
  dismissPipOverlayError(): void;
  resolvePipOverlayGesture(): void;
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

interface PipOverlayMediaHost {
  [PIP_OVERLAY_MEDIA_SYMBOL]?: HTMLVideoElement;
}

function getPipMedia(container: Element): HTMLVideoElement | null {
  return (container as PipOverlayMediaHost)[PIP_OVERLAY_MEDIA_SYMBOL] ?? null;
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'blob:']);

function isAllowedSrc(src: string): boolean {
  try {
    const url = new URL(src, location.href);
    return ALLOWED_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

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
    pipOverlayRequiresGesture: false,

    showPipOverlay(src?) {
      const state = get();
      const resolved = src ?? state.pipOverlaySrc ?? state.pipOverlaySources[0]?.src ?? null;
      if (!resolved) return;
      if (!isAllowedSrc(resolved)) {
        if (__DEV__) console.warn(`[pip-overlay] Blocked unsafe src: ${resolved}`);
        set({ pipOverlayError: 'Invalid source URL' });
        return;
      }
      set({ pipOverlayActive: true, pipOverlaySrc: resolved, pipOverlayError: null });
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
      const safe = sources.filter(s => isAllowedSrc(s.src));
      if (__DEV__ && safe.length < sources.length) {
        console.warn('[pip-overlay] Filtered unsafe source URLs');
      }
      set({ pipOverlaySources: safe });
      if (!get().pipOverlaySrc && safe.length > 0) set({ pipOverlaySrc: safe[0].src });
    },

    setPipOverlayLang(lang) {
      const source = get().pipOverlaySources.find(s => s.lang === lang);
      if (source) set({ pipOverlayLang: lang, pipOverlaySrc: source.src });
    },

    dismissPipOverlayError() { set({ pipOverlayError: null }); },

    resolvePipOverlayGesture() {
      set({ pipOverlayRequiresGesture: false });
      // UI component should follow up with a programmatic pipMedia.play()
    }
  }),

  attach({ target, signal, get, set }) {
    const { media, container } = target;
    if (!container || !isMediaPauseCapable(media) || !isMediaSeekCapable(media)) return;

    const pip = () => getPipMedia(container);

    // --- RTL: Flip default position ---
    if (isRTL(container)) {
      const { pipOverlayPosition } = get();
      if (pipOverlayPosition.x === 0.78) {
        set({ pipOverlayPosition: { x: 0.22, y: pipOverlayPosition.y } });
      }
    }

    // --- Live stream detection: skip drift sync ---
    const isLive = () => !isFinite(media.duration);

    // --- Soft Sync Logic (VOD only) ---
    const syncTime = () => {
      const pipEl = pip();
      if (!pipEl || !get().pipOverlayActive || isLive()) return;
      const drift = pipEl.currentTime - media.currentTime;
      const absDrift = Math.abs(drift);
      
      if (absDrift > 2) {
        pipEl.currentTime = media.currentTime;
      } else if (absDrift > 0.3) {
        const baseRate = media.playbackRate;
        pipEl.playbackRate = drift > 0 ? baseRate * 0.9 : baseRate * 1.1;
      } else if (pipEl.playbackRate !== media.playbackRate) {
        pipEl.playbackRate = media.playbackRate;
      }
    };

    const syncPlayState = () => {
      const pipEl = pip();
      if (!pipEl || !get().pipOverlayActive) return;
      if (media.paused && !pipEl.paused) {
        pipEl.pause();
      } else if (!media.paused && pipEl.paused) {
        pipEl.play().catch((err) => {
          if (err.name === 'NotAllowedError') set({ pipOverlayRequiresGesture: true });
        });
      }
    };

    // --- Bi-directional Buffering (500ms debounce) ---
    let bufferingTimer: ReturnType<typeof setTimeout> | null = null;

    const onPipWaiting = () => {
      if (bufferingTimer) return;
      bufferingTimer = setTimeout(() => {
        if (!media.paused && get().pipOverlayActive) media.pause();
        bufferingTimer = null;
      }, 500);
    };

    const onPipPlaying = () => {
      if (bufferingTimer) {
        clearTimeout(bufferingTimer);
        bufferingTimer = null;
        return; // Recovered within threshold, no pause needed
      }
      if (media.paused && get().pipOverlayActive) {
        media.play().catch(() => {});
      }
    };

    signal.addEventListener('abort', () => {
      if (bufferingTimer) clearTimeout(bufferingTimer);
    });

    // --- Fullscreen Guard: Force container fullscreen when PIP active ---
    // Intercept fullscreen requests to prevent iOS Safari native video fullscreen
    // which rips <video> from DOM and destroys PIP overlay.
    // The existing fullscreen feature already prefers container fullscreen;
    // this guard ensures it NEVER falls back to webkitSetPresentationMode
    // when PIP overlay is active.
    // Implementation: pip-overlay-element listens for 'fullscreenchange' and
    // if webkitPresentationMode === 'fullscreen' while pipOverlayActive,
    // exits and re-requests on container instead.

    // --- Memory Cleanup on source change / hide ---
    let prevSrc: string | null = null;
    const cleanupVideo = (pipEl: HTMLVideoElement) => {
      pipEl.removeAttribute('src');
      pipEl.load(); // Release buffers
    };

    // --- DRM detection (__DEV__ only) ---
    if (__DEV__ && 'mediaKeys' in media && media.mediaKeys) {
      console.warn('[pip-overlay] Main video uses EME/DRM. PIP overlay does not support DRM sources.');
    }

    // --- ResizeObserver (Clamp + Mobile Scale + Orientation) ---
    const resizeObserver = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      if (width < 640 && get().pipOverlayScale < 0.4) set({ pipOverlayScale: 0.4 });
      
      // Re-clamp after rotation animation completes
      requestAnimationFrame(() => {
        const { x, y } = get().pipOverlayPosition;
        get().setPipOverlayPosition(x, y);
      });
    });
    resizeObserver.observe(container);
    signal.addEventListener('abort', () => resizeObserver.disconnect());

    // --- Page Visibility: hard re-sync on tab return ---
    listen(document, 'visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      const pipEl = pip();
      if (!pipEl || !get().pipOverlayActive || isLive()) return;
      pipEl.currentTime = media.currentTime;
      pipEl.playbackRate = media.playbackRate;
    }, { signal });

    // --- Listeners ---
    listen(media, 'timeupdate', syncTime, { signal });
    listen(media, 'seeked', () => { 
      const pipEl = pip();
      if (pipEl && !isLive()) pipEl.currentTime = media.currentTime; 
    }, { signal });
    listen(media, 'play', syncPlayState, { signal });
    listen(media, 'pause', syncPlayState, { signal });
    listen(media, 'playing', syncPlayState, { signal });

    // --- Watch for source changes: cleanup old video, abort pending loads ---
    // Implemented in UI element: on src attribute change, call cleanupVideo()
    // before setting new src. Uses generation counter to ignore stale loads.
  },
});
```

---

## Phase 3: Selectors & Exports

### `packages/core/src/dom/store/selectors.ts`

```ts
import { pipOverlayFeature } from './features/pip-overlay';
export const selectPipOverlay = createSelector(pipOverlayFeature);
```

### `packages/core/src/dom/store/features/index.ts`

```ts
export { pipOverlayFeature, PIP_OVERLAY_MEDIA_SYMBOL } from './pip-overlay';
```

---

## Phase 4: PIP Overlay Element (HTML)

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
12. **Keyboard A11y**: `keydown` listener on the overlay. `ArrowKeys` to move position (+/- 0.05). `Shift + ArrowKeys` to resize scale (+/- 0.05). **RTL**: Arrow left/right flipped via `isRTL()` check.
13. **Autoplay Policy (Idea A)**: If `pipOverlayRequiresGesture` is true, render a large overlay button: "Click to enable secondary video". Click calls `resolvePipOverlayGesture()` and `.play()` on the internal video.
14. **Bi-directional Buffering**: Listen to internal `<video>` `waiting`/`playing` events. Delegate to store feature's debounced buffering logic (500ms threshold before pausing main).
15. **Fullscreen Guard**: On iOS Safari, intercept fullscreen to force container fullscreen path. If `webkitPresentationMode` changes to `'fullscreen'` while PIP active, exit and re-request on container. If container fullscreen unavailable, show warning via `pipOverlayError`.
16. **Aria-Live**: Render an internal visually hidden `aria-live="polite"` element. Specific strings: `"Secondary video opened"`, `"Secondary video closed"`, `"Secondary video error: {message}"`, `"Secondary video resumed"`.
17. **Min size**: `min-width: 160px` — prevents unreadable overlay on very small containers.
18. **Drag cancellation**: Watch `pipOverlayActive` — if becomes `false` during drag, release pointer capture via `releasePointerCapture()`, reset drag state, remove `data-dragging`.
19. **Memory cleanup**: On `pip-src` change or hide, call `video.removeAttribute('src')` + `video.load()` to release buffers before setting new source. Prevents mobile memory pressure and stacked loads.
20. **iOS video limit**: If internal `<video>` fires `error` with `MEDIA_ERR_DECODE`, show `__DEV__` warning about iOS hardware video decoder limits.
21. **Drag rAF batching**: `pointermove` handler stores latest position, applies via single `requestAnimationFrame`. Prevents layout thrashing on 120Hz+ displays.
22. **Source generation counter**: Increment `#loadGeneration` on each source change. In `loadedmetadata`/`canplay` handlers, ignore if generation doesn't match. Prevents stale source display on rapid toggle.

**Accessibility:**

- `role="region"` + `aria-label="Secondary video overlay"`
- Close button: `aria-label="Close secondary video"`
- Resize handles: `aria-hidden="true"` (visual indicators only — keyboard resize operates on overlay itself via Shift+Arrow)
- `tabindex="-1"` — NOT in tab order. Focus moves to overlay only when toggle button activates it. This prevents screen reader users from encountering overlay before main controls.
- `Escape` key closes overlay with `stopPropagation()` — does not bubble to fullscreen handler
- Focus returns to toggle button on close
- `data-active` / `data-dragging` / `data-resizing` / `data-loading` / `data-error` / `data-requires-gesture` attributes

**Observed attributes:**

- `pip-src` — direct source (Hybrid option A path)
- `crossorigin` — CORS override
- `pip-loading` — `'spinner' | 'black' | 'poster'`
- `pip-animation` — `'scale-fade' | 'fade' | 'slide' | 'none'`
- `pip-position` — `'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'`
- `pip-constrained` — boolean

---

## Phase 5: PIP Toggle Button Element (HTML)

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

## Phase 6: PIP Source Element (HTML)

### `packages/html/src/ui/pip-overlay/pip-source-element.ts` (new)

`<pip-source>` — declarative multi-language source element.

```html
<pip-source data-lang="es" label="Lengua de señas" src="sign-lang-es.mp4"></pip-source>
```

- Extends `HTMLElement` (lightweight, no ReactiveElement needed)
- Attributes: `src`, `data-lang`, `label` (`data-lang` avoids semantic conflict with HTML `lang` attribute)
- Observed by the skin/provider via `MutationObserver` or `slotchange`
- Populates `pipOverlaySources` in the store

---

## Phase 7: CSS Styles

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
  min-width: 160px;
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
  touch-action: none; /* Prevent scroll conflict on touch drag */
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

/* Touch devices: close button always visible */
@media (hover: none) {
  media-pip-overlay[data-active] .pip-overlay__close { opacity: 1; }
}

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

/* Gesture Fallback UI */
media-pip-overlay .pip-overlay__gesture-prompt {
  position: absolute; inset: 0; background: rgba(0,0,0,0.8);
  display: flex; align-items: center; justify-content: center;
  color: white; font-weight: bold; cursor: pointer;
  z-index: 5;
}

/* Reduced motion: disable all transitions/animations (WCAG 2.3.3) */
@media (prefers-reduced-motion: reduce) {
  media-pip-overlay,
  media-pip-overlay .pip-overlay__close,
  media-pip-overlay .pip-overlay__resize {
    transition: none;
  }
  media-pip-overlay[data-active] {
    transform: translate(-50%, -50%); /* No scale animation */
  }
}

/* Windows High Contrast / forced-colors */
@media (forced-colors: active) {
  media-pip-overlay .pip-overlay__close {
    background: Canvas;
    color: ButtonText;
    border: 1px solid ButtonText;
  }
  media-pip-overlay .pip-overlay__resize {
    background: ButtonText;
  }
  media-pip-overlay {
    border: 2px solid ButtonText;
  }
}

/* Mobile */
@container (max-width: 640px) {
  media-pip-overlay { width: calc(var(--pip-scale-mobile, 0.4) * 100%); }
}
```

---

## Phase 8: HTML Skin Integration

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

## Phase 10: Unit Tests (Core)

### `packages/core/src/dom/store/features/tests/pip-overlay.test.ts`

> Already implemented. See Phase 19 for the full test list including retroactive additions.

---

## Phase 11: Retroactive Updates

Decisions added after phases 1–9 were completed. These must be applied to existing code before continuing.

### Phase 2 updates (`pip-overlay.ts`)

- [ ] Add `isAllowedSrc()` URL validation to `showPipOverlay()` and `setPipOverlaySources()`
- [ ] Add `isLive()` guard to `syncTime` and `seeked` handler
- [ ] Add `visibilitychange` listener for hard re-sync on tab return
- [ ] Add 500ms debounce to bi-directional buffering (`waiting`/`playing`)
- [ ] Add `isRTL()` default position flip in `attach()`
- [ ] Add DRM `__DEV__` warning in `attach()`
- [ ] Add `requestAnimationFrame` in ResizeObserver for orientation re-clamp
- [ ] Replace `(container as any)` with typed `getPipMedia()` helper

### Phase 4 updates (`pip-overlay-element.ts`)

- [ ] Add `tabindex="-1"` (was `0`), focus via toggle button only
- [ ] Add `stopPropagation()` on Escape key
- [ ] Add focus return to toggle button on close
- [ ] Add rAF batching for `pointermove` → `setPipOverlayPosition()`
- [ ] Add `#loadGeneration` counter for source race prevention
- [ ] Add memory cleanup on source change / hide (`removeAttribute('src')` + `load()`)
- [ ] Add drag cancellation on `pipOverlayActive` → `false`
- [ ] Add iOS `MEDIA_ERR_DECODE` `__DEV__` warning
- [ ] Add fullscreen guard (intercept `webkitPresentationMode`)

### Phase 5 updates (`pip-overlay-toggle-element.ts`)

- [ ] Store ref for focus return from overlay Escape

### Phase 6 updates (`pip-source-element.ts`)

- [ ] Change `lang` attribute to `data-lang`

### Phase 7 updates (CSS)

- [ ] Add `touch-action: none` on `[data-active]`
- [ ] Add `min-width: 160px`
- [ ] Add `@media (hover: none)` close button always visible
- [ ] Add `@media (prefers-reduced-motion: reduce)` disable all transitions
- [ ] Add `@media (forced-colors: active)` system colors for interactive elements

### Phase 10 updates (unit tests)

- [ ] Add URL sanitization tests
- [ ] Add live stream sync skip tests
- [ ] Add page visibility re-sync tests
- [ ] Add source load race (generation counter) tests
- [ ] Add debounced buffering tests
- [ ] Add RTL default position tests
- [ ] Add drag cancellation tests
- [ ] Add rAF batching tests

---

## Phase 12: React PipOverlay Component

### `packages/react/src/ui/pip-overlay/pip-overlay.tsx` (new)

`<PipOverlay>` — React equivalent of `<media-pip-overlay>`.

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
  const overlayRef = useRef<HTMLDivElement>(null);
  const [loadGeneration] = useState(() => ({ current: 0 }));
  const [dragFrame] = useState(() => ({ current: 0 }));

  // ... implementation
}

export namespace PipOverlay {
  export type Props = PipOverlayProps;
}
```

**All responsibilities (mirrors HTML element):**

1. Render `<video muted playsInline>` via `videoRef`
2. `useEffect`: register/unregister `videoRef` on container via `PIP_OVERLAY_MEDIA_SYMBOL`
3. CSS custom properties: `--pip-x`, `--pip-y`, `--pip-scale`, `--pip-aspect`
4. **Drag** via `onPointerDown` → `setPointerCapture` → `onPointerMove` → `onPointerUp`
5. **Drag rAF batching**: store latest position in ref, apply via `requestAnimationFrame` (120Hz+ safe)
6. **Resize**: corner handles, same pointer pattern → `setPipOverlayScale()`
7. Close button → `hidePipOverlay()` + return focus to toggle
8. Aspect ratio: `onLoadedMetadata` → `videoWidth/videoHeight` → `--pip-aspect`
9. Crossorigin: inherit from main `<video>`, fallback to prop
10. Error: `onError` → `pipOverlayError`. `MEDIA_ERR_DECODE` → `__DEV__` iOS warning
11. Loading: `data-loading` until `onCanPlay`
12. **Keyboard**: `onKeyDown` — Arrow keys move (±0.05), Shift+Arrow resize (±0.05). **RTL**: flip horizontal via `isRTL()`
13. **Escape**: `stopPropagation()` — close overlay, don't exit fullscreen. Return focus to toggle.
14. **Autoplay fallback**: if `pipOverlayRequiresGesture`, render "Tap to Play" overlay button
15. **Bi-directional buffering**: `onWaiting`/`onPlaying` delegate to store debounced logic
16. **Fullscreen guard**: intercept `webkitPresentationMode` change while PIP active
17. **aria-live**: visually hidden region with specific strings ("opened", "closed", "error: {msg}", "resumed")
18. **Min size**: `min-width: 160px`
19. **Drag cancellation**: `useEffect` watches `pipOverlayActive` — if `false` during drag, release pointer capture
20. **Memory cleanup**: on src change or unmount: `video.removeAttribute('src')` + `video.load()`
21. **Source generation counter**: increment `loadGeneration.current` on src change, ignore stale `onLoadedMetadata`/`onCanPlay`
22. `tabindex={-1}` — not in tab order, focused via toggle button

**Key differences from HTML element:**
- `usePlayer(selectPipOverlay)` instead of `PlayerController`
- `useContainer()` for symbol registration
- React refs for `<video>` and overlay `<div>`
- `useEffect` for lifecycle (symbol register, event listeners, cleanup)
- `useCallback` for drag/resize handlers (stable refs for pointer capture)
- JSX render instead of imperative DOM

---

## Phase 13: React PipOverlayToggle Component

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

## Phase 14: React usePipOverlay Hook

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

## Phase 15: React Skin Integration

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

## Phase 16: React Package Exports

### `packages/react/src/index.ts`

```diff
+export { PipOverlay, type PipOverlayProps } from './ui/pip-overlay/pip-overlay';
+export { PipOverlayToggle, type PipOverlayToggleProps } from './ui/pip-overlay/pip-overlay-toggle';
+export { usePipOverlay } from './ui/pip-overlay/use-pip-overlay';
```

---

## Phase 17: HTML Sandbox Demo

### `apps/sandbox/src/html-pip-overlay/` (new)

```
apps/sandbox/src/html-pip-overlay/
├── index.html
└── main.ts
```

HTML sandbox with `<video-player>`, `<video-skin pip-src="...">`, PIP overlay toggle, hotkey.

---

## Phase 18: React Sandbox Demo

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

## Phase 19: Full Test Checklist

### `packages/core/src/dom/store/features/tests/pip-overlay.test.ts`

Comprehensive test list. Phase 10 covers the baseline (marked `[x]`). Phase 11 retroactive additions marked `[ ]`.

**State actions:**

- [x] `showPipOverlay()` sets active + resolves src
- [x] `hidePipOverlay()` clears active
- [x] `togglePipOverlay()` toggles
- [x] `setPipOverlayPosition()` clamps when constrained
- [x] `setPipOverlayScale()` clamps to 0.15–0.5
- [x] `setPipOverlaySources()` + auto-select first source
- [x] `setPipOverlayLang()` selects matching source
- [x] `dismissPipOverlayError()` clears error
- [x] `resolvePipOverlayGesture()` clears gesture block flag

**Source resolution priority:**

- [x] Programmatic src wins over stored src
- [x] Stored src wins over sources[0]
- [x] No source → no-op

**Sync (mocked media, VOD):**

- [x] `timeupdate` → soft sync `playbackRate` when drift 0.3s–2s
- [x] `timeupdate` → hard sync `currentTime` when drift > 2s
- [x] `seeked` → syncs PIP `currentTime`
- [x] `play` → calls PIP `play()`
- [x] `pause` → calls PIP `pause()`
- [x] `ratechange` → syncs PIP `playbackRate`

**URL sanitization:**

- [ ] `showPipOverlay('javascript:alert(1)')` → blocked, sets error
- [ ] `showPipOverlay('https://example.com/v.mp4')` → allowed
- [ ] `showPipOverlay('data:text/html,...')` → blocked
- [ ] `showPipOverlay('blob:...')` → allowed
- [ ] `setPipOverlaySources()` filters unsafe URLs, keeps safe ones

**Bi-directional buffering (debounced):**

- [ ] PIP `waiting` does NOT immediately pause main
- [ ] PIP `playing` within 500ms cancels pending pause
- [ ] PIP `waiting` > 500ms pauses main
- [ ] PIP `playing` after pause resumes main

**Live streams:**

- [ ] `duration === Infinity` → `syncTime` skipped
- [ ] `seeked` with live → no PIP `currentTime` sync
- [ ] `visibilitychange` with live → no re-sync

**Page visibility:**

- [ ] Tab hidden → return → PIP `currentTime` hard syncs
- [ ] Tab hidden → return → PIP `playbackRate` matches main

**RTL:**

- [ ] Default position flips to `x: 0.22` in RTL
- [ ] Non-default position unchanged in RTL

**Fullscreen guard:**

- [ ] PIP active → fullscreen uses container
- [ ] Sets `pipOverlayError` if container fullscreen unavailable

**Mobile & resize:**

- [x] Container < 640px → scale adjusts to 0.4
- [x] Position re-clamps on resize
- [ ] Position re-clamps after orientation (rAF delay)

**Source load race:**

- [ ] Rapid `showPipOverlay('a')` then `showPipOverlay('b')` → only `b` displays
- [ ] Stale `loadedmetadata` ignored via generation counter

**Drag:**

- [ ] `pipOverlayActive` → `false` during drag releases pointer capture
- [ ] Multiple `pointermove` in one frame → single `setPipOverlayPosition()` (rAF)

---

## Phase 20: Verification

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
8. Keyboard: Tab to overlay, Escape to close, Arrow keys to move, Shift+Arrow keys to resize.
9. Press `p` → toggle PIP overlay
10. Fullscreen → PIP persists
11. Resize browser to < 640px → PIP scale increases to 40% and clamps within view if outside.
12. Screen reader test → ARIA labels read correctly and `aria-live` announces state.
13. Error source → error message shown in overlay
14. Test in Chrome, Firefox, Safari
15. Verify Bi-directional buffering: throttle network, main pauses only after 500ms buffer stall. Quick recovery = no pause.
16. Verify Autoplay Policy fallback UI (requires strict autoplay block).
17. **iOS Safari**: Enter fullscreen with PIP active → must use container fullscreen, PIP overlay persists. No native video fullscreen takeover.
18. **RTL**: Set `dir="rtl"` on container → PIP defaults to bottom-left. Arrow keys movement flipped.
19. **Touch**: On mobile device, close button always visible (no hover required).
20. **Live stream**: Load live/DVR source → PIP plays independently, no drift sync attempts.
21. **Memory**: Toggle PIP on/off rapidly 10x → check DevTools memory tab for no video buffer leaks.
22. **Drag cancel**: While dragging overlay, call `hidePipOverlay()` programmatically → overlay closes cleanly, no stuck pointer capture.
23. **URL safety**: Set `pip-src="javascript:alert(1)"` → blocked, error shown. `pip-src="https://..."` → works.
24. **Orientation**: Rotate mobile device while PIP visible → overlay re-clamps within bounds after rotation.
25. **Reduced motion**: Set `prefers-reduced-motion: reduce` in OS/browser → open/close PIP has no animation, drag has no transition.
26. **High contrast**: Enable Windows High Contrast → close button and resize handles visible with system colors. Overlay has visible border.
27. **Tab visibility**: Play main + PIP → switch tab for 10s → return → PIP re-syncs immediately to main currentTime.
28. **Rapid source switch**: Toggle between sources rapidly → only final source displays, no flash of intermediate sources.
29. **Drag smoothness**: On 120Hz display (iPad Pro), drag overlay → smooth movement, no jank or double-updates per frame.

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
| NEW | `src/html-pip-overlay/index.html` | `apps/sandbox` |
| NEW | `src/html-pip-overlay/main.ts` | `apps/sandbox` |
| NEW | `src/react-pip-overlay/index.html` | `apps/sandbox` |
| NEW | `src/react-pip-overlay/main.tsx` | `apps/sandbox` |
