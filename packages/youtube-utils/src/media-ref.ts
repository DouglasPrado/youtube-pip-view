/**
 * Reconhece um vídeo a partir de um link, em qualquer serviço suportado.
 *
 * O app nasceu só com YouTube — daí o nome do pacote. Vimeo, Twitch e
 * Dailymotion entraram depois, com o mesmo formato de saída, para que fila,
 * player e extensão tratem todos do mesmo jeito.
 */

import { extractVideoRef } from "./extract-video-id.js";

export type Provider = "youtube" | "vimeo" | "twitch" | "dailymotion";

/** Twitch tem três coisas diferentes atrás do mesmo domínio. */
export type TwitchKind = "video" | "channel" | "clip";

export interface MediaRef {
  provider: Provider;
  /** ID do vídeo, ou o nome do canal quando é uma transmissão ao vivo. */
  id: string;
  /** Segundo em que o link pede para começar. 0 quando não há. */
  startSeconds: number;
  /** Só para Twitch: o que esse id representa. */
  kind?: TwitchKind;
}

// ===== Vimeo =====

const VIMEO_PATTERNS = [
  /player\.vimeo\.com\/video\/(\d+)/,
  /vimeo\.com\/(?:channels\/[\w-]+\/)?(\d+)/,
  /vimeo\.com\/groups\/[\w-]+\/videos\/(\d+)/,
];

/** Vimeo usa `#t=1m30s`. */
function vimeoStart(input: string): number {
  const match = input.match(/[#?&]t=(?:(\d+)h)?(?:(\d+)m)?(\d+)s?/i);
  if (!match) return 0;
  const [, h, m, s] = match;
  return (
    parseInt(h || "0", 10) * 3600 +
    parseInt(m || "0", 10) * 60 +
    parseInt(s || "0", 10)
  );
}

// ===== Dailymotion =====

const DAILYMOTION_PATTERNS = [
  /dailymotion\.com\/video\/([a-zA-Z0-9]+)/,
  /dailymotion\.com\/embed\/video\/([a-zA-Z0-9]+)/,
  /dai\.ly\/([a-zA-Z0-9]+)/,
];

// ===== Twitch =====

const TWITCH_VIDEO = /twitch\.tv\/videos\/(\d+)/;
const TWITCH_CLIP = [
  /clips\.twitch\.tv\/([a-zA-Z0-9_-]+)/,
  /twitch\.tv\/[\w-]+\/clip\/([a-zA-Z0-9_-]+)/,
];
const TWITCH_CHANNEL = /twitch\.tv\/([a-zA-Z0-9_]{3,25})(?:[/?#]|$)/;

/** Caminhos do twitch.tv que não são canais. */
const TWITCH_RESERVED = new Set([
  "videos", "directory", "settings", "subscriptions", "friends",
  "wallet", "drops", "downloads", "jobs", "turbo", "prime", "store",
  "p", "u", "team", "search", "following", "collections",
]);

/** Twitch marca o tempo com `?t=1h2m3s`. */
function twitchStart(input: string): number {
  const match = input.match(/[?&]t=(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/i);
  if (!match || !match.slice(1).some(Boolean)) return 0;
  const [, h, m, s] = match;
  return (
    parseInt(h || "0", 10) * 3600 +
    parseInt(m || "0", 10) * 60 +
    parseInt(s || "0", 10)
  );
}

/**
 * Lê um link e devolve o vídeo que ele aponta, seja de que serviço for.
 * Devolve null quando não reconhece — nunca chuta.
 */
export function parseMediaUrl(input: string): MediaRef | null {
  if (!input || !input.trim()) return null;
  const url = input.trim();

  // YouTube primeiro: é o caso mais comum e aceita IDs soltos.
  const youtube = extractVideoRef(url);
  if (youtube) {
    return {
      provider: "youtube",
      id: youtube.videoId,
      startSeconds: youtube.startSeconds,
    };
  }

  for (const pattern of VIMEO_PATTERNS) {
    const match = url.match(pattern);
    if (match) {
      return { provider: "vimeo", id: match[1], startSeconds: vimeoStart(url) };
    }
  }

  for (const pattern of DAILYMOTION_PATTERNS) {
    const match = url.match(pattern);
    if (match) {
      return { provider: "dailymotion", id: match[1], startSeconds: 0 };
    }
  }

  const twitchVideo = url.match(TWITCH_VIDEO);
  if (twitchVideo) {
    return {
      provider: "twitch",
      id: twitchVideo[1],
      kind: "video",
      startSeconds: twitchStart(url),
    };
  }

  for (const pattern of TWITCH_CLIP) {
    const match = url.match(pattern);
    if (match) {
      return { provider: "twitch", id: match[1], kind: "clip", startSeconds: 0 };
    }
  }

  const twitchChannel = url.match(TWITCH_CHANNEL);
  if (twitchChannel && !TWITCH_RESERVED.has(twitchChannel[1].toLowerCase())) {
    return {
      provider: "twitch",
      id: twitchChannel[1],
      kind: "channel",
      startSeconds: 0,
    };
  }

  return null;
}

/**
 * O endereço público do vídeo — o que vai para "abrir no site de origem"
 * e para o campo url da fila.
 */
export function mediaPageUrl(ref: MediaRef): string {
  switch (ref.provider) {
    case "youtube":
      return `https://www.youtube.com/watch?v=${ref.id}`;
    case "vimeo":
      return `https://vimeo.com/${ref.id}`;
    case "dailymotion":
      return `https://www.dailymotion.com/video/${ref.id}`;
    case "twitch":
      if (ref.kind === "video") return `https://www.twitch.tv/videos/${ref.id}`;
      if (ref.kind === "clip") return `https://clips.twitch.tv/${ref.id}`;
      return `https://www.twitch.tv/${ref.id}`;
  }
}

/** Nome do serviço para mostrar na interface. */
export function providerLabel(provider: Provider): string {
  switch (provider) {
    case "youtube":
      return "YouTube";
    case "vimeo":
      return "Vimeo";
    case "twitch":
      return "Twitch";
    case "dailymotion":
      return "Dailymotion";
  }
}

/**
 * Identidade do vídeo em uma string.
 *
 * A fila, o armazenamento e o IPC trocam vídeos como texto desde a primeira
 * versão, quando só havia YouTube. Em vez de mudar todos eles para um objeto,
 * o provedor entra na própria chave: "vimeo:123", "twitch:channel:gaules".
 * IDs antigos, sem prefixo, continuam sendo do YouTube.
 */
export function mediaKey(ref: MediaRef): string {
  if (ref.provider === "youtube") return ref.id;
  if (ref.provider === "twitch") {
    return `twitch:${ref.kind ?? "video"}:${ref.id}`;
  }
  return `${ref.provider}:${ref.id}`;
}

export function parseMediaKey(key: string): MediaRef {
  const parts = key.split(":");

  if (parts.length === 1) {
    // Formato antigo: só o id do YouTube.
    return { provider: "youtube", id: key, startSeconds: 0 };
  }

  const [provider, ...rest] = parts;

  if (provider === "twitch") {
    const kind = (rest.length > 1 ? rest[0] : "video") as TwitchKind;
    const id = rest.length > 1 ? rest.slice(1).join(":") : rest[0];
    return { provider: "twitch", id, kind, startSeconds: 0 };
  }

  if (provider === "vimeo" || provider === "dailymotion" || provider === "youtube") {
    return { provider, id: rest.join(":"), startSeconds: 0 };
  }

  // Não reconhecido: trata como YouTube, que é o formato herdado.
  return { provider: "youtube", id: key, startSeconds: 0 };
}

/** Miniatura do vídeo, quando o serviço oferece uma sem precisar de API. */
export function mediaThumbnail(ref: MediaRef): string | null {
  switch (ref.provider) {
    case "youtube":
      return `https://img.youtube.com/vi/${ref.id}/mqdefault.jpg`;
    case "dailymotion":
      return `https://www.dailymotion.com/thumbnail/video/${ref.id}`;
    // Vimeo e Twitch exigem consulta à API para descobrir a imagem.
    default:
      return null;
  }
}
