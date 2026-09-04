import electron from "electron";
import Store from "electron-store";
import * as path from "path";
import { fileURLToPath } from "url";
import { getServerUrl, startServer } from "./server.js";
const { BrowserWindow } = electron;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const store = new Store<{
  windowSize?: { width: number; height: number };
  windowPosition?: { x: number; y: number };
}>();

export async function createWindow(): Promise<
  InstanceType<typeof BrowserWindow>
> {
  const storedSize = store.get("windowSize");
  const storedPosition = store.get("windowPosition");

  const defaultWidth = 400;

  const ASPECT_RATIO = 16 / 9;
  const MIN_WIDTH = 320;

  const preloadPath = path.resolve(__dirname, "../preload/preload.cjs");

  const distPath = path.join(__dirname, "../../dist");
  await startServer(distPath);

  let initialWidth = Math.max(storedSize?.width || defaultWidth, MIN_WIDTH);
  let initialHeight = Math.round(initialWidth / ASPECT_RATIO);

  const win = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    minWidth: MIN_WIDTH,
    minHeight: Math.round(MIN_WIDTH / ASPECT_RATIO),
    x: storedPosition?.x,
    y: storedPosition?.y,
    frame: false,
    transparent: true, // Habilitar transparência para permitir setOpacity
    resizable: true,
    movable: true,
    fullscreenable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    type: "panel", // NSPanel no macOS - melhor comportamento para PiP
    backgroundColor: "#000000",
    show: false, // Não mostrar até estar pronto
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      // O app existe para tocar vídeo assim que abre; sem isto o Chromium
      // segura o autoplay esperando um clique dentro do player.
      autoplayPolicy: "no-user-gesture-required",
    },
  });

  // Configuração de PiP - manter janela sempre no topo
  const applyPiPSettings = () => {
    if (process.platform === "darwin") {
      win.setAlwaysOnTop(true, "floating");
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } else {
      win.setAlwaysOnTop(true, "floating");
      win.setVisibleOnAllWorkspaces(true);
    }
  };

  // Aplicar imediatamente
  applyPiPSettings();

  // Reaplicar após janela carregada com pequeno delay
  win.once("ready-to-show", () => {
    win.show();
    // Não focar automaticamente - deixar usuário clicar para focar

    // Delay de 100ms para garantir que janela está totalmente inicializada
    setTimeout(() => {
      applyPiPSettings();
    }, 100);
  });

  // Proporção 16:9 aplicada pelo sistema durante o arrasto. Corrigir por
  // conta própria no will-resize/resize fazia a janela tremer.
  win.setAspectRatio(ASPECT_RATIO);

  // Salvar tamanho e posição
  const saveBounds = () => {
    const bounds = win.getBounds();
    store.set("windowSize", {
      width: bounds.width,
      height: bounds.height,
    });
    store.set("windowPosition", {
      x: bounds.x,
      y: bounds.y,
    });
  };

  win.on("moved", saveBounds);
  win.on("resized", saveBounds);

  const serverUrl = getServerUrl();
  if (serverUrl) {
    await win.loadURL(serverUrl);
  } else {
    const indexPath = path.join(__dirname, "../../dist/index.html");
    await win.loadFile(indexPath);
  }

  return win;
}

// Criar janela da fila de reprodução (playlist queue)
export async function createQueueWindow(): Promise<
  InstanceType<typeof BrowserWindow>
> {
  const preloadPath = path.resolve(__dirname, "../preload/preload.cjs");

  const win = new BrowserWindow({
    width: 420,
    height: 600,
    frame: true,
    transparent: false,
    resizable: true,
    movable: true,
    fullscreenable: false,
    skipTaskbar: false,
    alwaysOnTop: false,
    backgroundColor: "#1e1e1e",
    title: "Playlist",
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  const serverUrl = getServerUrl();
  if (serverUrl) {
    await win.loadURL(`${serverUrl}#/queue`);
  } else {
    const indexPath = path.join(__dirname, "../../dist/index.html");
    await win.loadFile(indexPath, { hash: "/queue" });
  }

  return win;
}

// Função para aplicar configurações de PiP no macOS
export function applyMacOSPiPSettings(
  win: InstanceType<typeof BrowserWindow>
): void {
  if (process.platform === "darwin") {
    win.setAlwaysOnTop(true, "floating");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    win.setAlwaysOnTop(true, "floating");
    win.setVisibleOnAllWorkspaces(true);
  }
}

/**
 * Traz a janela de volta a partir de qualquer estado em que ela possa estar:
 * escondida, minimizada pelo sistema ou transparente por uma versão antiga
 * do "minimizar" que só baixava a opacidade.
 *
 * É o único caminho de restauração — usado pelo atalho global, pelo ícone da
 * barra de menu e por uma segunda instância do app.
 */
export function restoreWindow(
  win: InstanceType<typeof BrowserWindow> | null
): void {
  if (!win || win.isDestroyed()) return;

  if (win.getOpacity() < 1) {
    win.setOpacity(1);
  }
  if (win.isMinimized()) {
    win.restore();
  }

  applyMacOSPiPSettings(win);
  win.show();
  win.focus();
}
