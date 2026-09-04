/**
 * Textos do processo principal: menu da barra de menu e diálogos do sistema.
 * A interface do YTView fala português do Brasil (ver renderer/strings.ts).
 */
export const strings = {
  app: {
    name: 'YTView',
    trayTooltip: 'YTView - YouTube PiP',
    trayTooltipPlaying: (title: string) => `YTView - ${title}`,
  },

  tray: {
    show: 'Mostrar YTView',
    hide: 'Ocultar YTView',
    queue: 'Abrir fila',
    quit: 'Sair do YTView',
  },

  dialogs: {
    startupFailedTitle: 'O YTView não conseguiu abrir',
    startupFailedMessage: 'O YTView não conseguiu iniciar o servidor local.',
    startupFailedDetail: (reason: string) =>
      `${reason}\n\nFeche outros programas que possam estar usando a porta 8765 e abra o YTView de novo.`,

    portInUseTitle: 'Porta 8765 em uso',
    portInUseMessage: 'A porta 8765 está sendo usada por outro programa.',
    portInUseDetail:
      'O YTView abriu normalmente, mas a extensão do Chrome não vai conseguir enviar vídeos até a porta ser liberada.',

    shortcutTakenTitle: 'Atalho indisponível',
    shortcutTakenMessage: 'O atalho ⌘⇧Y já está sendo usado por outro programa.',
    shortcutTakenDetail:
      'Para trazer o YTView de volta, clique no ícone dele na barra de menu do macOS.',

    ok: 'Entendi',
    close: 'Fechar',
  },
} as const;
