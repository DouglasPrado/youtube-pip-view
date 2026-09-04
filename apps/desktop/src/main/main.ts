import { app, BrowserWindow, dialog, ipcMain, Menu, Tray, nativeImage, shell } from 'electron';
import { createWindow, createQueueWindow, restoreWindow } from './window';
import { registerShortcuts, unregisterShortcuts } from './shortcuts';
import { stopServer, isExtensionApiAvailable } from './server';
import { initQueueStore, getQueue, saveQueue, broadcastQueueUpdate, playVideoNow, addItemsToQueue, hydrateQueueTitles, setNowPlaying } from './queue-store';
import Store from 'electron-store';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { QueueItem, QueueState } from '../types/index';
import { strings } from './strings';
import {
  advanceAfterEnded,
  moveItemAfterCurrent,
  removeFromQueue,
  reorderQueue,
} from './queue-logic';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const store = new Store<{
  lastVideoId?: string;
  lastVideoPosition?: { videoId: string; seconds: number };
  volume?: number;
  muted?: boolean;
  onboardingSeen?: boolean;
  windowSize?: { width: number; height: number };
  queue?: QueueState;
}>();

let mainWindow: InstanceType<typeof BrowserWindow> | null = null;
let queueWindow: InstanceType<typeof BrowserWindow> | null = null;
let tray: InstanceType<typeof Tray> | null = null;
let isQuitting = false;
let lastProcessedEndedEvent:
  | { key: string; timestamp: number }
  | null = null;
// Guarda a fila apagada pelo "Limpar fila" até a próxima limpeza, para o desfazer.
let lastClearedQueue: QueueState | null = null;
let currentVideoTitle = '';

initQueueStore(store, () => ({ main: mainWindow, queue: queueWindow }));

// Register ytview:// protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('ytview', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('ytview');
}

function handleProtocolUrl(url: string) {
  try {
    const parsed = new URL(url);

    // ytview://queue — a extensão usa para abrir a janela da fila.
    if (parsed.pathname === '/queue' || parsed.host === 'queue') {
      const tryOpen = () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          restoreWindow(mainWindow);
          void openQueueWindow();
        } else {
          setTimeout(tryOpen, 500);
        }
      };
      tryOpen();
      return;
    }

    if (parsed.pathname === '/play' || parsed.host === 'play') {
      const videoId = parsed.searchParams.get('v');
      if (videoId) {
        // Wait for window to be ready before playing
        const tryPlay = () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            playVideoNow(videoId);
          } else {
            setTimeout(tryPlay, 500);
          }
        };
        tryPlay();
      }
    }
  } catch {
    // Invalid URL, ignore
  }
}

async function openQueueWindow(): Promise<void> {
  if (queueWindow && !queueWindow.isDestroyed()) {
    queueWindow.show();
    queueWindow.focus();
    return;
  }
  queueWindow = await createQueueWindow();
  queueWindow.on('closed', () => {
    queueWindow = null;
  });
}

function quitApp() {
  isQuitting = true;
  app.quit();
}

function createTray() {
  if (process.platform !== 'darwin') return;

  try {
    // Template icon para macOS (adapta automaticamente ao tema claro/escuro)
    const iconPath = path.join(__dirname, '../../assets/tray-iconTemplate.png');
    let trayImage;

    try {
      trayImage = nativeImage.createFromPath(iconPath);
      trayImage.setTemplateImage(true);
    } catch (e) {
      // Fallback para ícone regular
      const fallbackPath = path.join(__dirname, '../../assets/tray-icon.png');
      try {
        trayImage = nativeImage.createFromPath(fallbackPath);
      } catch (e2) {
        trayImage = nativeImage.createEmpty();
      }
    }

    tray = new Tray(trayImage || nativeImage.createEmpty());
    tray.setToolTip(strings.app.trayTooltip);

    // Menu do Tray: o caminho de volta visível quando a janela está escondida.
    const contextMenu = Menu.buildFromTemplate([
      {
        label: strings.tray.show,
        accelerator: 'CommandOrControl+Shift+Y',
        click: () => restoreWindow(mainWindow),
      },
      {
        label: strings.tray.hide,
        click: () => mainWindow?.hide(),
      },
      { type: 'separator' },
      {
        label: strings.tray.queue,
        click: () => { void openQueueWindow(); },
      },
      { type: 'separator' },
      {
        label: strings.tray.quit,
        accelerator: 'Command+Q',
        click: quitApp,
      },
    ]);

    // Botão direito abre o menu; botão esquerdo continua alternando a janela.
    tray.on('right-click', () => tray?.popUpContextMenu(contextMenu));

    tray.on('click', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;

      // isVisible() sozinho não basta: a janela pode estar visível mas
      // transparente, ou minimizada pelo sistema.
      const isReallyVisible =
        mainWindow.isVisible() &&
        !mainWindow.isMinimized() &&
        mainWindow.getOpacity() >= 1;

      if (isReallyVisible) {
        mainWindow.hide();
      } else {
        restoreWindow(mainWindow);
      }
    });
  } catch (error) {
    console.error('Erro ao criar Tray:', error);
  }
}

// Fechar a janela apenas esconde; quem encerra é o menu do tray ou o Cmd+Q.
function attachHideOnClose(win: InstanceType<typeof BrowserWindow>) {
  win.on('close', (event: any) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  // Esconder tem que calar o som. Sem isto o vídeo seguia tocando sem janela
  // nenhuma na tela - e não havia como pausar a não ser trazendo tudo de volta.
  // Vale para o ✕, o Cmd+W, o Ocultar do menu e o Cmd+H do sistema.
  win.on('hide', () => {
    if (!win.isDestroyed()) {
      win.webContents.send('pause-playback');
    }
  });
}

function reportStartupFailure(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error('[Main] Falha ao iniciar:', error);

  dialog.showMessageBoxSync({
    type: 'error',
    title: strings.dialogs.startupFailedTitle,
    message: strings.dialogs.startupFailedMessage,
    detail: strings.dialogs.startupFailedDetail(detail),
    buttons: [strings.dialogs.close],
  });

  quitApp();
}

function warnExtensionApiUnavailable() {
  void dialog.showMessageBox({
    type: 'warning',
    title: strings.dialogs.portInUseTitle,
    message: strings.dialogs.portInUseMessage,
    detail: strings.dialogs.portInUseDetail,
    buttons: [strings.dialogs.ok],
  });
}

async function bootstrap() {
  mainWindow = await createWindow();
  registerShortcuts(mainWindow);
  attachHideOnClose(mainWindow);

  createTray();

  if (!isExtensionApiAvailable()) {
    warnExtensionApiUnavailable();
  }
}

// Uma instância só: a segunda tentaria subir na mesma porta, falharia, e
// ficaria rodando sem janela nenhuma.
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event: any, argv: string[]) => {
    restoreWindow(mainWindow);

    const protocolArg = argv.find((arg) => arg.startsWith('ytview://'));
    if (protocolArg) {
      handleProtocolUrl(protocolArg);
    }
  });

  // macOS: handle protocol URL when app is already running
  app.on('open-url', (event: any, url: string) => {
    event.preventDefault();
    handleProtocolUrl(url);
  });

  // Handle protocol URL from launch args (Windows/Linux)
  const protocolArg = process.argv.find(arg => arg.startsWith('ytview://'));
  if (protocolArg) {
    app.whenReady().then(() => handleProtocolUrl(protocolArg));
  }

  app.whenReady()
    .then(async () => {
      await bootstrap();

      app.on('activate', async () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          mainWindow = await createWindow();
          registerShortcuts(mainWindow);
          attachHideOnClose(mainWindow);
        } else {
          restoreWindow(mainWindow);
        }
      });
    })
    .catch(reportStartupFailure);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    isQuitting = true;
    stopServer();
    app.quit();
  }
});

// Precisa vir antes do 'close' da janela, senão o Cmd+Q é engolido pelo
// preventDefault que transforma fechar em esconder.
app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  isQuitting = true;
  unregisterShortcuts();
  stopServer();
});

// IPC Handlers
ipcMain.handle('get-stored-video', (_: any) => {
  return store.get('lastVideoId') || null;
});

ipcMain.handle('save-video', (_: any, videoId: string) => {
  store.set('lastVideoId', videoId);
});

ipcMain.handle('save-video-position', (_: any, videoId: string, seconds: number) => {
  if (!videoId || typeof seconds !== 'number' || !isFinite(seconds) || seconds < 0) return;
  store.set('lastVideoPosition', { videoId, seconds });
});

ipcMain.handle('get-video-position', (_: any, videoId: string) => {
  const saved = store.get('lastVideoPosition');
  if (!saved || saved.videoId !== videoId) return 0;
  return saved.seconds;
});

ipcMain.handle('get-stored-volume', (_: any) => {
  return store.get('volume') ?? 100;
});

ipcMain.handle('save-volume', (_: any, volume: number) => {
  // Volume 0 não é guardado: mudo é um estado à parte (ver save-muted).
  if (typeof volume === 'number' && volume > 0) {
    store.set('volume', volume);
  }
});

ipcMain.handle('get-stored-muted', (_: any) => {
  return store.get('muted') ?? false;
});

ipcMain.handle('save-muted', (_: any, muted: boolean) => {
  store.set('muted', Boolean(muted));
});

ipcMain.handle('has-seen-onboarding', (_: any) => {
  return store.get('onboardingSeen') ?? false;
});

ipcMain.handle('mark-onboarding-seen', (_: any) => {
  store.set('onboardingSeen', true);
});

// O título do vídeo vira o tooltip do ícone na barra de menu: dá para saber
// o que está tocando mesmo com a janela escondida.
ipcMain.handle('set-window-title', (_: any, title: string) => {
  currentVideoTitle = typeof title === 'string' ? title : '';
  tray?.setToolTip(
    currentVideoTitle
      ? strings.app.trayTooltipPlaying(currentVideoTitle)
      : strings.app.trayTooltip
  );
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitle(currentVideoTitle || strings.app.name);
  }
});

// O vídeo passou a tocar: alinhar a fila com ele.
ipcMain.handle('set-now-playing', async (_: any, videoId: string) => {
  if (!videoId) return getQueue();
  return setNowPlaying(videoId);
});

ipcMain.handle('get-window-size', (_: any) => {
  return store.get('windowSize') || null;
});

ipcMain.handle('save-window-size', (_: any, size: { width: number; height: number }) => {
  store.set('windowSize', size);
});

// Handler para mover a janela (usado para arrastar)
ipcMain.on('window-move', (_event: any, { deltaX, deltaY }: any) => {
  if (mainWindow) {
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(x + deltaX, y + deltaY);
  }
});

// Handler para abrir URL no navegador
ipcMain.handle('open-external-url', async (_: any, url: string) => {
  try {
    console.log('Abrindo URL externa:', url);
    await shell.openExternal(url);
    console.log('URL aberta com sucesso');
  } catch (error) {
    console.error('Erro ao abrir URL:', error);
    throw error;
  }
});

// Handler para toggle fullscreen
ipcMain.handle('toggle-fullscreen', () => {
  if (mainWindow) {
    const isFullScreen = mainWindow.isFullScreen();
    if (!isFullScreen) {
      // Entrar em fullscreen
      mainWindow.setAlwaysOnTop(false);
      mainWindow.setFullScreen(true);
    } else {
      // Sair de fullscreen e restaurar PiP
      mainWindow.setFullScreen(false);
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (process.platform === 'darwin') {
            mainWindow.setAlwaysOnTop(true, 'floating');
            mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
          } else {
            mainWindow.setAlwaysOnTop(true, 'floating');
            mainWindow.setVisibleOnAllWorkspaces(true);
          }
        }
      }, 300);
    }
    return !isFullScreen;
  }
  return false;
});

// Minimizar: esconder de verdade. Baixar a opacidade deixava a janela no
// caminho do mouse, invisível e sempre no topo.
ipcMain.handle('minimize-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setOpacity(1);
    mainWindow.hide();
  }
});

// Fechar esconde a janela, igual ao Cmd+W. Sair é o Cmd+Q ou o menu do tray.
ipcMain.handle('close-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
});

ipcMain.handle('quit-app', () => {
  quitApp();
});

// ===== Queue/Playlist IPC Handlers =====

ipcMain.handle('open-queue-window', async () => {
  await openQueueWindow();
});

ipcMain.handle('get-queue', async () => {
  return hydrateQueueTitles();
});

ipcMain.handle('set-queue', (_: any, items: QueueItem[]) => {
  const queue = getQueue();
  queue.items = items;
  saveQueue(queue);
  broadcastQueueUpdate(queue);
});

ipcMain.handle('add-to-queue', async (_: any, items: Array<{ videoId: string; url: string; title?: string }>) => {
  if (!Array.isArray(items) || items.length === 0) return getQueue();
  return addItemsToQueue(items);
});

ipcMain.handle('remove-from-queue', (_: any, id: string) => {
  const { state, playVideoId } = removeFromQueue(getQueue(), id);
  saveQueue(state);

  if (playVideoId && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('play-video', playVideoId);
  }

  broadcastQueueUpdate(state);
});

ipcMain.handle('clear-queue', () => {
  const current = getQueue();
  lastClearedQueue = current.items.length > 0 ? current : null;

  const queue: QueueState = { items: [], currentIndex: -1 };
  saveQueue(queue);
  broadcastQueueUpdate(queue);

  return lastClearedQueue !== null;
});

ipcMain.handle('undo-clear-queue', () => {
  if (!lastClearedQueue) return null;

  const restored = lastClearedQueue;
  lastClearedQueue = null;
  saveQueue(restored);
  broadcastQueueUpdate(restored);
  return restored;
});

ipcMain.handle('reorder-queue', (_: any, fromIndex: number, toIndex: number) => {
  const state = reorderQueue(getQueue(), fromIndex, toIndex);
  saveQueue(state);
  broadcastQueueUpdate(state);
});

ipcMain.handle('play-next-in-queue', (_: any, id: string) => {
  const state = moveItemAfterCurrent(getQueue(), id);
  saveQueue(state);
  broadcastQueueUpdate(state);
});

ipcMain.handle('play-from-queue', (_: any, index: number) => {
  const queue = getQueue();
  if (index < 0 || index >= queue.items.length) return;

  queue.currentIndex = index;
  saveQueue(queue);

  const videoId = queue.items[index].videoId;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('play-video', videoId);
  }

  broadcastQueueUpdate(queue);
});

ipcMain.handle('video-ended', (_: any, endedVideoId?: string) => {
  const { state, playVideoId, endedIndex } = advanceAfterEnded(
    getQueue(),
    endedVideoId
  );
  if (endedIndex === -1) return;

  // O fim pode ser reportado mais de uma vez (evento do player e fallback):
  // duas trocas seguidas pulariam um vídeo.
  const dedupeKey = `${endedIndex}:${endedVideoId ?? ''}`;
  const now = Date.now();
  if (
    lastProcessedEndedEvent &&
    lastProcessedEndedEvent.key === dedupeKey &&
    now - lastProcessedEndedEvent.timestamp < 2000
  ) {
    return;
  }
  lastProcessedEndedEvent = { key: dedupeKey, timestamp: now };

  saveQueue(state);

  if (playVideoId && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('play-video', playVideoId);
  }

  broadcastQueueUpdate(state);
});
