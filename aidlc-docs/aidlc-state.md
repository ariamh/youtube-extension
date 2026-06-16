# AI-DLC State — yt-buffer-glitch

- **Project type**: Chrome Extension (Manifest V3), content script + popup
- **Mode**: Greenfield, adaptive minimal depth
- **Lifecycle**:
  - [x] Workspace Detection (greenfield)
  - [x] Requirements Analysis (minimal + 1 clarify)
  - [x] Code Generation
  - [x] Build & manual test instructions (Node unit test of trigger logic)

## Decisions
- MV3, no remote code, no permissions beyond content script on youtube.com.
- Glitch = full-screen buffering overlay + video.pause() for ~5s, fires when Math.floor(currentTime) hits each 2-min multiple (120, 240, 360...).
- Toggle on/off via popup, state persisted in chrome.storage.local. Default ON.
