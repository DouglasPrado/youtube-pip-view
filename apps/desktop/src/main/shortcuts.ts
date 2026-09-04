import electron from 'electron';
import { restoreWindow } from './window.js';
import { strings } from './strings.js';
const { globalShortcut, BrowserWindow, dialog } = electron;

let mainWindow: InstanceType<typeof BrowserWindow> | null = null;

export function registerShortcuts(window: InstanceType<typeof BrowserWindow>): void{
  mainWindow = window;

  // Cmd+Shift+Y: trazer a janela de volta de qualquer estado
  const registered = globalShortcut.register('CommandOrControl+Shift+Y', () => {
    restoreWindow(mainWindow);
  });

  // Pausar sem precisar trazer a janela para frente - o ponto do app é
  // assistir enquanto se faz outra coisa.
  const playPauseRegistered = globalShortcut.register(
    'CommandOrControl+Shift+Space',
    () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('toggle-play');
      }
    }
  );

  if (!playPauseRegistered) {
    console.warn('Atalho global de pausa (⌘⇧Espaço) indisponível');
  }

  if (!registered) {
    console.error('Falha ao registrar atalho Control+Shift+Y');

    // Sem esse atalho e sem essa mensagem, a pessoa fica sem saber por que a
    // janela não volta. O menu do ícone na barra continua funcionando.
    void dialog.showMessageBox({
      type: 'warning',
      title: strings.dialogs.shortcutTakenTitle,
      message: strings.dialogs.shortcutTakenMessage,
      detail: strings.dialogs.shortcutTakenDetail,
      buttons: [strings.dialogs.ok],
    });
  } else {
    console.log('Atalho Control+Shift+Y registrado com sucesso');
  }
}

export function unregisterShortcuts(): void {
  globalShortcut.unregisterAll();
}
