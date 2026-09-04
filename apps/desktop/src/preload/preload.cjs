const { contextBridge, ipcRenderer } = require('electron');

try {
  contextBridge.exposeInMainWorld('electronAPI', {
    getStoredVideo: () => ipcRenderer.invoke('get-stored-video'),
    saveVideo: (videoId) => ipcRenderer.invoke('save-video', videoId),
    saveVideoPosition: (videoId, seconds) =>
      ipcRenderer.invoke('save-video-position', videoId, seconds),
    getVideoPosition: (videoId) => ipcRenderer.invoke('get-video-position', videoId),
    getStoredVolume: () => ipcRenderer.invoke('get-stored-volume'),
    saveVolume: (volume) => ipcRenderer.invoke('save-volume', volume),
    getStoredMuted: () => ipcRenderer.invoke('get-stored-muted'),
    saveMuted: (muted) => ipcRenderer.invoke('save-muted', muted),
    hasSeenOnboarding: () => ipcRenderer.invoke('has-seen-onboarding'),
    markOnboardingSeen: () => ipcRenderer.invoke('mark-onboarding-seen'),
    setWindowTitle: (title) => ipcRenderer.invoke('set-window-title', title),
    setNowPlaying: (videoId) => ipcRenderer.invoke('set-now-playing', videoId),
    getWindowSize: () => ipcRenderer.invoke('get-window-size'),
    saveWindowSize: (size) => ipcRenderer.invoke('save-window-size', size),
    moveWindow: (deltaX, deltaY) => {
      ipcRenderer.send('window-move', { deltaX, deltaY });
    },
    openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
    toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
    minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
    closeWindow: () => ipcRenderer.invoke('close-window'),
    quitApp: () => ipcRenderer.invoke('quit-app'),
    // Queue/Playlist
    openQueueWindow: () => ipcRenderer.invoke('open-queue-window'),
    getQueue: () => ipcRenderer.invoke('get-queue'),
    setQueue: (items) => ipcRenderer.invoke('set-queue', items),
    addToQueue: (items) => ipcRenderer.invoke('add-to-queue', items),
    removeFromQueue: (id) => ipcRenderer.invoke('remove-from-queue', id),
    clearQueue: () => ipcRenderer.invoke('clear-queue'),
    undoClearQueue: () => ipcRenderer.invoke('undo-clear-queue'),
    playFromQueue: (index) => ipcRenderer.invoke('play-from-queue', index),
    reorderQueue: (from, to) => ipcRenderer.invoke('reorder-queue', from, to),
    playNextInQueue: (id) => ipcRenderer.invoke('play-next-in-queue', id),
    notifyVideoEnded: (videoId) => ipcRenderer.invoke('video-ended', videoId),
    onPlayVideo: (callback) => {
      const handler = (_event, videoId) => callback(videoId);
      ipcRenderer.on('play-video', handler);
      return () => ipcRenderer.removeListener('play-video', handler);
    },
    onPausePlayback: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('pause-playback', handler);
      return () => ipcRenderer.removeListener('pause-playback', handler);
    },
    onTogglePlay: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('toggle-play', handler);
      return () => ipcRenderer.removeListener('toggle-play', handler);
    },
    onQueueUpdated: (callback) => {
      const handler = (_event, state) => callback(state);
      ipcRenderer.on('queue-updated', handler);
      return () => ipcRenderer.removeListener('queue-updated', handler);
    }
  });
} catch (error) {
  console.error('[PRELOAD] Error exposing electronAPI:', error);
  throw error;
}
