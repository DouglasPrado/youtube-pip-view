import { contextBridge, ipcRenderer } from 'electron';
import type { QueueItem, QueueState } from '../types';

contextBridge.exposeInMainWorld('electronAPI', {
  getStoredVideo: () => ipcRenderer.invoke('get-stored-video'),
  saveVideo: (videoId: string) => ipcRenderer.invoke('save-video', videoId),
  saveVideoPosition: (videoId: string, seconds: number) =>
    ipcRenderer.invoke('save-video-position', videoId, seconds),
  getVideoPosition: (videoId: string) => ipcRenderer.invoke('get-video-position', videoId),
  getWindowSize: () => ipcRenderer.invoke('get-window-size'),
  saveWindowSize: (size: { width: number; height: number }) =>
    ipcRenderer.invoke('save-window-size', size),
  moveWindow: (deltaX: number, deltaY: number) => {
    ipcRenderer.send('window-move', { deltaX, deltaY });
  },
  getStoredVolume: () => ipcRenderer.invoke('get-stored-volume'),
  saveVolume: (volume: number) => ipcRenderer.invoke('save-volume', volume),
  getStoredMuted: () => ipcRenderer.invoke('get-stored-muted'),
  saveMuted: (muted: boolean) => ipcRenderer.invoke('save-muted', muted),
  hasSeenOnboarding: () => ipcRenderer.invoke('has-seen-onboarding'),
  markOnboardingSeen: () => ipcRenderer.invoke('mark-onboarding-seen'),
  setWindowTitle: (title: string) => ipcRenderer.invoke('set-window-title', title),
  setNowPlaying: (videoId: string) => ipcRenderer.invoke('set-now-playing', videoId),
  openExternalUrl: (url: string) => ipcRenderer.invoke('open-external-url', url),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  // Queue/Playlist
  openQueueWindow: () => ipcRenderer.invoke('open-queue-window'),
  getQueue: () => ipcRenderer.invoke('get-queue'),
  setQueue: (items: QueueItem[]) => ipcRenderer.invoke('set-queue', items),
  addToQueue: (items: Array<{ videoId: string; url: string; title?: string }>) =>
    ipcRenderer.invoke('add-to-queue', items),
  removeFromQueue: (id: string) => ipcRenderer.invoke('remove-from-queue', id),
  clearQueue: () => ipcRenderer.invoke('clear-queue'),
  undoClearQueue: () => ipcRenderer.invoke('undo-clear-queue'),
  playFromQueue: (index: number) => ipcRenderer.invoke('play-from-queue', index),
  reorderQueue: (from: number, to: number) => ipcRenderer.invoke('reorder-queue', from, to),
  playNextInQueue: (id: string) => ipcRenderer.invoke('play-next-in-queue', id),
  notifyVideoEnded: (videoId?: string) => ipcRenderer.invoke('video-ended', videoId),
  onPlayVideo: (callback: (videoId: string) => void) => {
    const handler = (_event: any, videoId: string) => callback(videoId);
    ipcRenderer.on('play-video', handler);
    return () => { ipcRenderer.removeListener('play-video', handler); };
  },
  onPausePlayback: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('pause-playback', handler);
    return () => { ipcRenderer.removeListener('pause-playback', handler); };
  },
  onTogglePlay: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('toggle-play', handler);
    return () => { ipcRenderer.removeListener('toggle-play', handler); };
  },
  onQueueUpdated: (callback: (state: QueueState) => void) => {
    const handler = (_event: any, state: QueueState) => callback(state);
    ipcRenderer.on('queue-updated', handler);
    return () => { ipcRenderer.removeListener('queue-updated', handler); };
  },
});

declare global {
  interface Window {
    electronAPI: {
      getStoredVideo: () => Promise<string | null>;
      saveVideo: (videoId: string) => Promise<void>;
      saveVideoPosition: (videoId: string, seconds: number) => Promise<void>;
      getVideoPosition: (videoId: string) => Promise<number>;
      getWindowSize: () => Promise<{ width: number; height: number } | null>;
      saveWindowSize: (size: { width: number; height: number }) => Promise<void>;
      moveWindow: (deltaX: number, deltaY: number) => void;
      getStoredVolume: () => Promise<number>;
      saveVolume: (volume: number) => Promise<void>;
      getStoredMuted: () => Promise<boolean>;
      saveMuted: (muted: boolean) => Promise<void>;
      hasSeenOnboarding: () => Promise<boolean>;
      markOnboardingSeen: () => Promise<void>;
      setWindowTitle: (title: string) => Promise<void>;
      setNowPlaying: (videoId: string) => Promise<QueueState>;
      onPausePlayback: (callback: () => void) => () => void;
      onTogglePlay: (callback: () => void) => () => void;
      openExternalUrl: (url: string) => Promise<void>;
      toggleFullscreen: () => Promise<boolean>;
      minimizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;
      quitApp: () => Promise<void>;
      // Queue/Playlist
      openQueueWindow: () => Promise<void>;
      getQueue: () => Promise<QueueState>;
      setQueue: (items: QueueItem[]) => Promise<void>;
      addToQueue: (items: Array<{ videoId: string; url: string; title?: string }>) => Promise<QueueState>;
      removeFromQueue: (id: string) => Promise<void>;
      clearQueue: () => Promise<boolean>;
      undoClearQueue: () => Promise<QueueState | null>;
      playFromQueue: (index: number) => Promise<void>;
      reorderQueue: (from: number, to: number) => Promise<void>;
      playNextInQueue: (id: string) => Promise<void>;
      notifyVideoEnded: (videoId?: string) => Promise<void>;
      onPlayVideo: (callback: (videoId: string) => void) => () => void;
      onQueueUpdated: (callback: (state: QueueState) => void) => () => void;
    };
  }
}
