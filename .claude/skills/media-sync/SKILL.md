---
name: media-sync
description: >-
  Advanced media synchronization patterns. Use when designing features that control multiple 
  <video> or <audio> elements, such as PIP overlays, multi-camera angles, or synchronized 
  transcripts. Covers soft sync (playbackRate), hard sync (currentTime), bi-directional 
  buffering, and autoplay policy handling.
  Triggers: "sync videos", "picture-in-picture", "pip sync", "buffering sync", "playbackrate sync".
---

# Media Synchronization Patterns

Principles for synchronizing multiple media elements in the DOM.

**Goal**: Synchronized playback must feel seamless. Avoid micro-stuttering, keep audio in sync, and handle network stalls gracefully.

## Quick Reference

### Time Synchronization
- **Soft Sync (Catch-up)**: For small drifts (< 2s), adjust `playbackRate` (e.g. `0.95x` or `1.05x`) on the secondary video to smoothly catch up.
- **Hard Sync**: Only force `currentTime` when the drift is large (> 2s) or upon a deliberate `seeked` event on the main media. Constant `currentTime` updates cause buffer flushing and micro-stuttering.

### Buffering Sync (Bi-directional)
- **Unidirectional fails**: If the secondary video stalls (buffering), and the main video keeps playing, the user loses visual context (e.g., sign language PIP desyncs).
- **Bi-directional pausing**: Listen to the secondary video's `waiting` event to `pause()` the main video. Listen to `playing` to `play()` the main video.

### Play State Sync
- Slave media should mimic the play state of the master media.
- Master `play` → Slave `play()`.
- Master `pause` → Slave `pause()`.

### Autoplay Policies
- Browsers block `play()` calls that aren't backed by user gestures, even if the video is muted, especially when playing *two* videos simultaneously.
- **Fallback UI Pattern**: Catch `NotAllowedError` on the secondary video's `play()` Promise. If caught, render a visual prompt (e.g., "Tap to Play") over the secondary video. The prompt's `onClick` provides the user gesture needed to unlock it.

## Anti-Patterns

| Anti-Pattern                | Why It Fails                            |
| --------------------------- | --------------------------------------- |
| `timeupdate` → `currentTime`| Constant seeking flushes buffers, causes micro-stuttering |
| Assuming `play()` succeeds  | `NotAllowedError` breaks the sync loop if uncaught |
| Master-only buffering logic | Secondary video falls behind permanently if network drops |
| Double audio tracks         | Syncing two unmuted videos causes echo; always mute secondary unless mixing |
