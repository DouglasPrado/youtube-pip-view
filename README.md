# YouTube Picture-in-Picture

YTView is a macOS app that lets you watch YouTube videos in a floating window that stays always on top. Perfect for watching videos while working or using other apps — **completely ad-free**.

## What does YTView do?

YTView creates a compact, minimalist window that plays YouTube videos without ads or distractions. The window stays on top of all other applications, so you can watch your videos without switching between windows.

## Features

- **Ad-free playback** - Watch YouTube videos without any ads
- **Always on top** - The window stays visible over all other applications
- **Minimalist interface** - No distractions, just the video
- **Full keyboard control** - Play, seek, volume, queue navigation — all from the keyboard
- **Playback speed and captions** - 0.25× to 2×, plus captions, from the ⋯ menu
- **Video queue** - Line up videos, reorder by dragging, play next
- **Chrome extension** - Quickly send videos from your browser to YTView
- **Menu bar icon** - Show, hide, open the queue or quit from the macOS menu bar
- **Remembers where you stopped** - Reopens the last video and resumes its position

## Chrome Extension

The Chrome extension lets you interact with YTView directly from your browser:

- **Open in PIP** - Click the extension icon on any YouTube video to open it in YTView's floating window
- **Add to queue** - Hover over any video thumbnail on YouTube and click the "+" button to add it to the queue
- **Add playlists** - On playlist pages, click "Add all to YTView" to send the entire playlist to your queue

The extension communicates with the desktop app via a local API on port `8765`.

## Video Queue

YTView includes a built-in video queue so you can line up multiple videos:

- Add videos by URL or paste multiple links at once
- Play all queued videos in sequence — it advances on its own
- Drag to reorder, or send an item to play right after the current one
- Clearing the queue can be undone for 10 seconds
- Queue is persisted between sessions

## How to Use

1. **Open the app** - On launch, you'll see a field to enter the video
2. **Enter a video** - Paste any YouTube link: `watch?v=`, `youtu.be`, Shorts,
   live, or just the 11-character video ID. A `&t=` timestamp is honored.
3. **Confirm** - Press Enter or click **Tocar**
4. **Watch** - Click the video to pause, double-click for fullscreen
5. **Switch video** - Press **Cmd+L**, or use **Trocar de vídeo** in the ⋯ menu

The interface is in Brazilian Portuguese; this documentation is in English.

## Keyboard Shortcuts

Global (work even when YTView is not focused):

- **Cmd+Shift+Y**: Bring the window back from any state (hidden or minimized)
- **Cmd+Shift+Space**: Play / pause without switching windows

In the player window:

- **Space** or **K**: Play / pause
- **← / →**: Back / forward 5 seconds (hold **Shift** for 30)
- **J / L**: Back / forward 10 seconds
- **↑ / ↓**: Volume
- **0-9**: Jump to that point of the video (5 = halfway)
- **M**: Mute · **F**: Fullscreen
- **N / P**: Next / previous in the queue
- **Cmd+L**: Paste a new link
- **Cmd+W**: Hide the window - the video keeps its place
- **Cmd+Q**: Quit the app

Closing the window with the ✕ button hides it too. To quit, use Cmd+Q or
**Quit YTView** in the menu bar icon.

If ⌘⇧Y is already taken by another app, YTView says so on launch — the menu bar
icon still brings the window back.

## Requirements

- macOS (Electron-compatible version)
- Node.js (version 18 or higher)
- npm

## Download

Go to the [Releases](../../releases) page and download the latest `.dmg` file for macOS. Open the `.dmg` and drag YTView to your **Applications** folder.

> **Note:** Since the app is not signed by Apple, macOS may block it on first launch. Go to **System Settings > Privacy & Security** and click "Open Anyway".

## Development

This project uses a monorepo with [pnpm workspaces](https://pnpm.io/workspaces) and [Turborepo](https://turbo.build/).

### Install dependencies

```bash
pnpm install
```

### Run in development mode

```bash
pnpm turbo run build
cd apps/desktop && npm run electron:dev
```

### Run the tests

```bash
pnpm test
```

Covers YouTube link parsing (every accepted URL shape) and the queue rules
(reordering, removing what is playing, auto-advance).

### Build the app (.app / .dmg)

```bash
pnpm turbo run build
cd apps/desktop && npm run electron:build
```

The `.dmg` will be generated in `apps/desktop/release/`.
