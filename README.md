<p align="center">
  <img src="./assets/ytview-icon.png" width="180" alt="YTView logo" />
</p>

<h1 align="center">YTView</h1>

<p align="center">
  <strong>A focused floating YouTube player for macOS.</strong>
</p>

<p align="center">
  Watch YouTube in a compact, always-on-top window with
  Chrome integration, a persistent video queue and keyboard-first controls.
</p>

---

<p align="center">
  <img src="./assets/ytview-preview.png" alt="YTView running on macOS" />
</p>

## What is YTView?

YTView is a macOS desktop app designed for watching YouTube while you work.

Instead of keeping a full browser window open, YTView provides a compact floating player that stays above other applications and keeps playback controls, queue management and browser integration close at hand.

It combines:

- a desktop application built with Electron
- a React-based player interface
- a Chrome extension
- a persistent video queue
- global keyboard shortcuts
- a local integration API

The result is a lightweight companion for people who regularly keep YouTube running alongside their work.

---

## Why YTView?

Browser Picture-in-Picture is useful, but intentionally minimal.

YTView explores what happens when the floating player becomes an actual desktop application.

It adds application-level capabilities around the video experience:

- persistent queue
- browser-to-desktop integration
- global shortcuts
- menu bar controls
- remembered playback state
- playlist ingestion
- queue reordering
- richer playback controls

The goal is simple:

> **Keep the video available without keeping YouTube in the way.**

---

# Features

### Always-on-top player

YTView runs in a compact floating window that stays above other applications.

Use it while:

- coding
- studying
- writing
- browsing
- working in fullscreen applications

The player keeps a consistent video-oriented aspect ratio and is designed to behave like a native floating macOS utility.

---

### Video Queue

YTView includes a persistent queue for lining up content before or during playback.

You can:

- add videos individually
- paste multiple links
- reorder videos by dragging
- move a video to play next
- automatically advance through the queue
- remove queued items
- undo a cleared queue for a short period
- keep the queue between application sessions

Conceptually:

```text
Current Video
     │
     ▼
┌───────────────┐
│   Video #1    │
├───────────────┤
│   Video #2    │
├───────────────┤
│   Video #3    │
└───────────────┘
     │
     ▼
Auto advance
```

---

### Chrome Extension

The companion Chrome extension connects YouTube in the browser directly to the desktop application.

From YouTube you can:

- open the current video in YTView
- add a video directly to the queue
- add videos from thumbnails
- send an entire playlist to YTView

This turns the browser into a discovery interface while YTView remains the playback interface.

```text
YouTube in Chrome
       │
       │ Open / Queue
       ▼
Chrome Extension
       │
       │ localhost:8765
       ▼
     YTView
       │
       ▼
Floating Player
```

---

### Keyboard-first controls

YTView supports both application shortcuts and global macOS shortcuts.

#### Global shortcuts

These work even when YTView is not focused:

| Shortcut | Action |
|---|---|
| `⌘ ⇧ Y` | Bring YTView back |
| `⌘ ⇧ Space` | Play / pause |

#### Player shortcuts

| Shortcut | Action |
|---|---|
| `Space` / `K` | Play / pause |
| `←` / `→` | Seek 5 seconds |
| `Shift + ← / →` | Seek 30 seconds |
| `J` / `L` | Seek 10 seconds |
| `↑` / `↓` | Volume |
| `0–9` | Jump to percentage of video |
| `M` | Mute |
| `F` | Fullscreen |
| `N` | Next video |
| `P` | Previous video |
| `⌘ L` | Open another video |
| `⌘ W` | Hide YTView |
| `⌘ Q` | Quit |

---

### Menu Bar

YTView integrates with the macOS menu bar.

The menu bar icon provides quick access to:

- show the player
- hide the player
- open the queue
- restore the window
- quit the application

Closing the player window hides YTView instead of destroying the current playback state.

---

### Playback State

YTView remembers where you stopped.

When possible, the application restores:

- the last video
- playback position
- queue state

This allows the desktop player to behave more like a persistent media utility than a disposable browser tab.

---

### Flexible YouTube links

YTView accepts common YouTube URL formats including:

```text
youtube.com/watch?v=...
youtu.be/...
youtube.com/shorts/...
YouTube live URLs
11-character video IDs
```

Timestamp parameters such as `&t=` are also supported.

---

### Playback controls

The player supports:

- play / pause
- seeking
- volume
- mute
- fullscreen
- playback speed
- captions
- queue navigation

Playback speed can be adjusted from `0.25×` to `2×`.

---

# Architecture

YTView is not implemented using the browser's native Picture-in-Picture API.

It uses a regular Electron window configured to behave like a floating macOS player.

The application has three main layers:

```text
┌───────────────────────────────────────────┐
│              Electron Window              │
│                                           │
│  frameless                                │
│  always-on-top                            │
│  floating panel                           │
│  visible across workspaces                │
│                                           │
│    ┌─────────────────────────────────┐    │
│    │         React Renderer          │    │
│    │                                 │    │
│    │    Player UI                    │    │
│    │    Queue                        │    │
│    │    Controls                     │    │
│    │                                 │    │
│    │      ┌───────────────────┐      │    │
│    │      │  YouTube Player   │      │    │
│    │      │      iframe       │      │    │
│    │      └───────────────────┘      │    │
│    └─────────────────────────────────┘    │
│                                           │
└───────────────────────────────────────────┘
```

The Electron main process owns desktop-level behavior while the renderer manages the playback experience.

---

# Browser Integration

The Chrome extension communicates with the desktop application through a local HTTP API.

```text
┌──────────────────┐
│     YouTube      │
│      Chrome      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Chrome Extension │
└────────┬─────────┘
         │
         │ HTTP
         ▼
┌──────────────────────────┐
│     localhost:8765       │
│      Local API           │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│          YTView          │
│                          │
│  Player + Queue + State  │
└──────────────────────────┘
```

The API provides a local bridge between browser discovery and desktop playback.

This keeps the browser extension lightweight while allowing the desktop application to own queue state and playback behavior.

---

# Monorepo

YTView is organized as a pnpm workspace managed with Turborepo.

```text
youtube-pip-view/
│
├── apps/
│   ├── desktop/              # Electron desktop application
│   └── chrome-extension/     # Chrome integration
│
├── packages/                 # Shared packages
│
├── assets/                   # Application and repository assets
│
├── build/                    # Build resources
│
├── scripts/                  # Development/build scripts
│
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
└── package.json
```

The monorepo allows desktop, browser and shared code to evolve together while keeping application boundaries explicit.

---

# Application Flow

The most common browser-to-player flow looks like this:

```text
Discover video
      │
      ▼
YouTube / Chrome
      │
      ▼
Open in YTView
      │
      ▼
Chrome Extension
      │
      ▼
Local API
      │
      ▼
Desktop App
      │
      ├── Play immediately
      │
      └── Add to queue
```

Queue playback follows:

```text
Video A
   │
   ▼
Video B
   │
   ▼
Video C
   │
   ▼
...
```

The queue automatically advances when the current video finishes.

---

# Technology

YTView is primarily built with:

```text
TypeScript
Electron
React
Node.js
pnpm
Turborepo
Chrome Extensions
```

The desktop application uses Electron to access operating-system capabilities such as:

- floating windows
- global shortcuts
- menu bar integration
- application lifecycle
- native packaging

React powers the renderer and user-facing interface.

---

# Download

Download the latest macOS build from the
[Releases](https://github.com/DouglasPrado/youtube-pip-view/releases) page.

Download the `.dmg`, open it and drag **YTView** into your Applications folder.

> [!NOTE]
> YTView is currently distributed without Apple notarization/signing.
> macOS may block the first launch.
>
> Open **System Settings → Privacy & Security** and choose **Open Anyway** if necessary.

---

# Requirements

For users:

```text
macOS
```

For development:

```text
Node.js >= 18
pnpm
```

---

# Development

Clone the repository:

```bash
git clone https://github.com/DouglasPrado/youtube-pip-view.git
cd youtube-pip-view
```

Install dependencies:

```bash
pnpm install
```

Build the workspace:

```bash
pnpm turbo run build
```

Run the desktop application in development:

```bash
cd apps/desktop
npm run electron:dev
```

---

# Tests

Run the test suite:

```bash
pnpm test
```

The current tests cover important application behavior including:

- accepted YouTube URL formats
- video ID parsing
- queue ordering
- removing the active video
- queue auto-advance

---

# Build

Build the workspace:

```bash
pnpm turbo run build
```

Build the macOS application:

```bash
cd apps/desktop
npm run electron:build
```

The generated application packages are written to:

```text
apps/desktop/release/
```

---

# Design Decisions

## Electron window instead of native browser PiP

YTView intentionally uses its own Electron window instead of the browser Picture-in-Picture API.

This gives the application control over:

- window behavior
- queue interface
- navigation
- global shortcuts
- menu bar integration
- application state
- browser integration

The player can therefore behave as a complete desktop application rather than a restricted video surface.

---

## Local API instead of cloud communication

Communication between the Chrome extension and desktop application happens locally.

```text
Chrome Extension
       │
       ▼
localhost:8765
       │
       ▼
YTView
```

No external backend is required just to send a video from the browser to the application.

This keeps the integration simple and local-first.

---

## Browser for discovery, desktop for playback

YTView does not attempt to replace the entire YouTube website.

YouTube remains useful for:

- search
- recommendations
- subscriptions
- playlists
- discovery

YTView focuses on the part that benefits from a dedicated desktop experience:

> playback while doing something else.

---

## Persistent queue instead of transient playback

The queue is application state rather than temporary UI state.

This allows YTView to restore a user's playback workflow across application sessions.

---

# Engineering Goals

YTView is designed around a few principles.

### Focus

The interface should prioritize the video instead of recreating the full YouTube experience.

### Low friction

Going from a browser video to a floating player should require minimal interaction.

### Desktop integration

The application should behave like a macOS utility rather than a browser window disguised as an app.

### Persistence

Queue and playback context should survive temporary window changes and application restarts.

### Clear boundaries

Browser integration, desktop behavior and shared application logic should remain independently understandable.

---

# Project Status

YTView is under active development.

Current functionality includes:

- floating macOS player
- YouTube playback
- Chrome extension
- persistent queue
- playlist queueing
- keyboard controls
- global shortcuts
- playback speed
- captions
- menu bar integration
- playback position persistence
- `.dmg` packaging

Future behavior and implementation details may evolve as the application matures.

---

# Roadmap

Areas being explored include:

- stronger playback compatibility
- improved browser integration
- richer queue management
- better macOS integration
- application signing and notarization
- additional playback providers
- improved release automation

---

# Contributing

Contributions, bug reports and technical discussions are welcome.

When contributing:

1. Keep desktop-specific behavior inside the Electron boundary.
2. Keep browser-specific behavior inside the extension.
3. Prefer shared packages for reusable domain logic.
4. Add tests for URL parsing and queue behavior when changing those systems.
5. Verify the macOS build before submitting packaging-related changes.

Before opening a pull request:

```bash
pnpm test
pnpm turbo run build
```

---

# Philosophy

Video is often secondary to the work happening around it.

A tutorial runs while you code.

A podcast runs while you write.

A lecture runs while you take notes.

A long video runs while you work in another application.

YTView is built around that behavior.

> **YouTube when you want it. Your workspace when you don't.**

---

# Disclaimer

YTView is an independent open-source project and is not affiliated with, endorsed by or sponsored by YouTube or Google.

YouTube and the YouTube logo are trademarks of Google LLC.

---

# License

See the repository license for licensing information.
