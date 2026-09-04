/**
 * Todo texto que aparece na interface, num lugar só.
 *
 * Idioma da interface: português do Brasil. A documentação do repositório
 * (README, comentários de commit) fica em inglês. Antes disto convivia
 * "Abrir PIP" com "Add all to YTView" na mesma tarefa.
 */
export const strings = {
  player: {
    emptyTitle: "Escolha um vídeo",
    emptyHint: "Clique aqui ou pressione ⌘L para colar um link",
    emptyAria: "Escolher um vídeo",
    loading: "Carregando",
    hide: "Esconder a janela",
    hideHint: "Esconder (⌘⇧Y traz de volta)",
    fullscreen: "Tela cheia",
    exitFullscreen: "Sair da tela cheia",
    close: "Fechar a janela",
    closeHint: "Fechar (⌘Q para sair do app)",
  },

  controls: {
    previous: "Vídeo anterior da fila",
    next: "Próximo vídeo da fila",
    rewind: (seconds: number) => `Voltar ${seconds} segundos`,
    forward: (seconds: number) => `Avançar ${seconds} segundos`,
    play: "Tocar",
    pause: "Pausar",
    playHint: "Tocar (espaço)",
    pauseHint: "Pausar (espaço)",
    position: "Posição no vídeo",
    seekHint: "Arraste para buscar no vídeo",
    loadingHint: "Carregando...",
    volume: "Volume",
    mute: "Silenciar (M)",
    unmute: "Ativar o som (M)",
    muteAria: "Silenciar",
    unmuteAria: "Ativar o som",
    more: "Mais ações",
    queue: "Fila de vídeos",
    changeVideo: "Trocar de vídeo",
    openOnYouTube: "Abrir no site de origem",
    captions: "Legendas",
    captionsOn: "ligadas",
    captionsOff: "desligadas",
    speed: "Velocidade",
    live: "AO VIVO",
    nativeControls: "Use os controles do player",
  },

  input: {
    label: "Cole o link do vídeo",
    placeholder: "YouTube, Vimeo, Twitch ou Dailymotion",
    empty: "Cole o link de um vídeo",
    invalid:
      "Não reconheci esse link. Aceito YouTube (vídeo, Shorts, live), Vimeo, Twitch (vídeo, clipe ou canal) e Dailymotion.",
    usePasted: "Usar o texto copiado",
    cancel: "Cancelar",
    play: "Tocar",
    restart: "Recomeçar",
  },

  error: {
    openOnYouTube: "Abrir no site de origem",
    playNext: "Próximo da fila",
    changeVideo: "Trocar de vídeo",
  },

  onboarding: {
    title: "Bem-vindo ao YTView",
    click: "Clique no vídeo para pausar. Mova o mouse para ver os controles.",
    shortcuts: "traz a janela de volta de qualquer lugar.",
    shortcutsChange: "troca de vídeo.",
    queue: "Enfileire vários vídeos pelo menu ⋯ ou pela extensão do Chrome.",
    start: "Começar",
  },

  queue: {
    title: "Fila",
    empty: "vazia",
    countOf: (current: number, total: number, remaining: number) =>
      `${current} de ${total} · ${remaining} depois`,
    countPlain: (total: number) => `${total} vídeo(s)`,
    placeholder:
      "Cole links (um por linha)...\nYouTube, Vimeo, Twitch e Dailymotion.",
    inputAria: "Links para adicionar à fila",
    add: "Adicionar à fila",
    adding: "Adicionando...",
    needLinks: "Cole links de vídeo para adicionar à fila",
    noValidLinks: "Nenhum link de vídeo reconhecido",
    partial: (added: number, skipped: number) =>
      `${added} adicionado(s). ${skipped} link(s) não reconhecido(s).`,
    emptyTitle: "Nenhum vídeo na fila",
    emptyHint: "Cole links acima, ou use o botão + nas miniaturas do YouTube",
    nowPlaying: "tocando agora",
    playNow: "Tocar agora",
    playNext: "Tocar em seguida",
    remove: "Remover da fila",
    clear: "Limpar fila",
    playAll: "Tocar tudo",
    undo: "Desfazer",
    cleared: (count: number) =>
      count === 1
        ? "1 vídeo removido da fila"
        : `${count} vídeos removidos da fila`,
  },
} as const;
