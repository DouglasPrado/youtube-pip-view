/**
 * Textos da extensão. Mesmo idioma do app: português do Brasil.
 * Antes, "Add all to YTView" convivia com "Abrir PIP" na mesma tarefa.
 */
export const strings = {
  popup: {
    title: "YTView",
    detecting: "Procurando o vídeo...",
    thumbnailAlt: "Miniatura do vídeo",

    // Estado do app
    appOpen: "YTView aberto",
    appClosed: "YTView fechado",
    openApp: "Abrir o YTView",

    // Ações com o vídeo da aba
    play: "Tocar agora",
    addToQueue: "Adicionar à fila",
    playing: "Tocando no YTView",
    added: "Adicionado à fila",
    sending: "Enviando...",
    launching: "Abrindo o YTView...",
    retry: "Tentar de novo",

    // Sem vídeo na aba
    noVideoTitle: "Nenhum vídeo reconhecido nesta aba",
    pasteLabel: "Cole um link de vídeo",
    pastePlaceholder: "YouTube, Vimeo, Twitch ou Dailymotion",
    pasteInvalid: "Não reconheci esse link. Aceito YouTube, Vimeo, Twitch e Dailymotion.",
    usePasted: "Usar o link copiado",

    // Fila
    queueEmpty: "Fila vazia",
    queueCount: (total: number, remaining: number) =>
      remaining > 0
        ? `${total} na fila · ${remaining} depois do atual`
        : `${total} na fila`,
    nowPlaying: "Tocando:",
    openQueue: "Ver a fila",

    failed: "Não foi possível falar com o YTView.",
    download: "Baixar o app",
  },

  content: {
    addToQueue: "Adicionar à fila do YTView",
    playNow: "Tocar no YTView",
    alreadyQueued: "Já está na fila do YTView",
    addedOne: "Vídeo adicionado à fila do YTView",
    addedMany: (count: number) => `${count} vídeos adicionados à fila do YTView`,
    playing: "Tocando no YTView",
    addAll: "Adicionar tudo ao YTView",
    addAllCount: (count: number) => `Adicionar ${count} ao YTView`,
    adding: "Adicionando...",
    addedCount: (count: number) => `${count} adicionados`,
    failed: "Não deu certo",
    noPlaylistVideos: "Nenhum vídeo encontrado nesta playlist",
    scrollHint:
      "Role a playlist até o fim para incluir todos os vídeos — só os carregados entram.",
    openAppFirst: "Abra o YTView para enviar vídeos",
    genericFailure: "Não foi possível enviar o vídeo",
    noVideoInLink: "Esse link não é de um vídeo reconhecido",
    noVideoHere: "Esta aba não tem um vídeo reconhecido",
  },

  badge: {
    appOpen: "YTView aberto",
    appClosed: "YTView fechado — clique para abrir",
    queued: (count: number) =>
      count === 1 ? "1 vídeo na fila do YTView" : `${count} vídeos na fila do YTView`,
  },

  menu: {
    playNow: "Tocar no YTView",
    addToQueue: "Adicionar à fila do YTView",
  },

  api: {
    appClosed: "O YTView não está aberto",
    refused: "O YTView recusou o pedido",
    errorStatus: (status: number) => `O YTView respondeu com erro ${status}`,
    noVideos: "Nenhum vídeo para adicionar",
    unknownRequest: "Pedido desconhecido",
    noResponse: "A extensão não conseguiu responder",
  },
} as const;
