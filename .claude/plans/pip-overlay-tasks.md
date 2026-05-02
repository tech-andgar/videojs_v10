# PIP Overlay — Task Checklist

Tracks remaining work for phases 11–20. Phases 1–10 already completed.

## Phase 11: Retroactive Updates

### #1 Store Feature (`packages/core/src/dom/store/features/pip-overlay.ts`)

- [ ] Add `isAllowedSrc()` URL validation to `showPipOverlay()` and `setPipOverlaySources()`
- [ ] Add `isLive()` guard to `syncTime` and `seeked` handler
- [ ] Add `visibilitychange` listener for hard re-sync on tab return
- [ ] Add 500ms debounce to bi-directional buffering (`waiting`/`playing`)
- [ ] Add `isRTL()` default position flip in `attach()`
- [ ] Add DRM `__DEV__` warning in `attach()`
- [ ] Add `requestAnimationFrame` in ResizeObserver for orientation re-clamp
- [ ] Replace `(container as any)` with typed `getPipMedia()` helper

### #2 PIP Overlay Element (`packages/html/src/ui/pip-overlay/pip-overlay-element.ts`)

- [ ] Add `tabindex="-1"` (was `0`), focus via toggle button only
- [ ] Add `stopPropagation()` on Escape key
- [ ] Add focus return to toggle button on close
- [ ] Add rAF batching for `pointermove` → `setPipOverlayPosition()`
- [ ] Add `#loadGeneration` counter for source race prevention
- [ ] Add memory cleanup on source change/hide (`removeAttribute('src')` + `load()`)
- [ ] Add drag cancellation on `pipOverlayActive` → `false`
- [ ] Add iOS `MEDIA_ERR_DECODE` `__DEV__` warning
- [ ] Add fullscreen guard (intercept `webkitPresentationMode`)

### #3 Toggle, Source, CSS

- [ ] Phase 5: Store ref for focus return from overlay Escape (`pip-overlay-toggle-element.ts`)
- [ ] Phase 6: Change `lang` attribute to `data-lang` (`pip-source-element.ts`)
- [ ] Phase 7 CSS: `touch-action: none` on `[data-active]`
- [ ] Phase 7 CSS: `min-width: 160px`
- [ ] Phase 7 CSS: `@media (hover: none)` close button always visible
- [ ] Phase 7 CSS: `@media (prefers-reduced-motion: reduce)` disable transitions
- [ ] Phase 7 CSS: `@media (forced-colors: active)` system colors

### #4 Unit Tests (`packages/core/src/dom/store/features/tests/pip-overlay.test.ts`) — blocked by #1

- [ ] URL sanitization tests (javascript:, data:, blob:, https:)
- [ ] Live stream sync skip tests
- [ ] Page visibility re-sync tests
- [ ] Source load race (generation counter) tests
- [ ] Debounced buffering tests
- [ ] RTL default position tests
- [ ] Drag cancellation tests
- [ ] rAF batching tests

## Phase 12–16: React

### #5 React PipOverlay Component — blocked by #1, #2, #3

- [ ] Create `packages/react/src/ui/pip-overlay/pip-overlay.tsx`
- [ ] All 22 responsibilities mirroring HTML element

### #6 React PipOverlayToggle — blocked by #5

- [ ] Create `packages/react/src/ui/pip-overlay/pip-overlay-toggle.tsx`

### #7 React usePipOverlay Hook — blocked by #5

- [ ] Create `packages/react/src/ui/pip-overlay/use-pip-overlay.ts`

### #8 React Skin Integration — blocked by #5, #6

- [ ] Add to `packages/react/src/presets/video/skin.tsx`

### #9 React Package Exports — blocked by #5, #6, #7

- [ ] Export from `packages/react/src/index.ts`

## Phase 17–18: Sandbox Demos

### #10 HTML Sandbox Demo — blocked by #3

- [ ] Create `apps/sandbox/src/html-pip-overlay/index.html`
- [ ] Create `apps/sandbox/src/html-pip-overlay/main.ts`

### #11 React Sandbox Demo — blocked by #9

- [ ] Create `apps/sandbox/src/react-pip-overlay/index.html`
- [ ] Create `apps/sandbox/src/react-pip-overlay/main.tsx`

## Phase 19–20: Testing & Verification

### #12 Full Test Checklist — blocked by #4

- [ ] All tests from Phase 19 pass

### #13 Verification — blocked by #10, #11, #12

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm build:packages`
- [ ] Unit tests pass
- [ ] Manual HTML sandbox (29 items)
- [ ] Manual React sandbox (5 items)
