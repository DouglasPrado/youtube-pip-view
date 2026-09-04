import type { MediaRef } from "@ytview/youtube-utils";
import type { PlayerFacade, PlayerLoadError } from "./types";
import { createPlayerFacade } from "./facade";
import { createVimeoPlayer } from "./vimeo";
import { createTwitchPlayer } from "./twitch";
import { createDailymotionPlayer } from "./dailymotion";

export interface CreatePlayerOptions {
  container: HTMLElement;
  media: MediaRef;
  onReady: (facade: PlayerFacade) => void;
  onPlaybackStarted?: () => void;
  onError?: (error: PlayerLoadError) => void;
}

/**
 * Cria o player do serviço certo.
 *
 * Cada um tem sua própria API, mas todos entregam o mesmo PlayerFacade — é o
 * que permite a barra de controles, os atalhos e a fila funcionarem igual,
 * sem saber de onde o vídeo vem.
 */
export function createPlayerFor({
  container,
  media,
  onReady,
  onPlaybackStarted,
  onError,
}: CreatePlayerOptions): Promise<void> {
  const common = {
    container,
    videoId: media.id,
    startSeconds: media.startSeconds,
    onReady,
    onPlaybackStarted,
    onError,
  };

  switch (media.provider) {
    case "vimeo":
      return createVimeoPlayer(common);
    case "twitch":
      return createTwitchPlayer({ ...common, kind: media.kind ?? "video" });
    case "dailymotion":
      return createDailymotionPlayer(common);
    case "youtube":
    default:
      return createPlayerFacade(common);
  }
}
