import type { Provider } from "@ytview/youtube-utils";

/** Estados do player, como a IFrame API do YouTube os reporta. */
export const PLAYER_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

export interface PlayerLoadError {
  code: number;
  /** Mensagem pronta para mostrar a quem está usando o app. */
  message: string;
  /** Se faz sentido oferecer "abrir no YouTube" para contornar. */
  canOpenOnYouTube: boolean;
}

/** O que cada serviço permite: a interface some com o que não existe. */
export interface PlayerCapabilities {
  /** Twitch ao vivo não tem barra de progresso. */
  seek: boolean;
  /** Só o YouTube expõe velocidade e legendas por API. */
  speed: boolean;
  captions: boolean;
  /**
   * O serviço não abre uma API de controle (Dailymotion): o vídeo é operado
   * pelos botões do próprio player, e a barra do YTView sai da frente.
   */
  nativeControls?: boolean;
}

export interface PlayerProgress {
  currentTime: number;
  /** 0 enquanto o YouTube ainda não informou a duração. */
  duration: number;
}

/**
 * O que o resto do app usa do player. Envolve a IFrame API para que nenhum
 * componente precise falar postMessage nem adivinhar tempo por estimativa.
 */
export interface PlayerFacade {
  readonly provider: Provider;
  readonly capabilities: PlayerCapabilities;
  load(videoId: string, startSeconds?: number): void;
  play(): void;
  pause(): void;
  togglePlay(): void;
  seekTo(seconds: number): void;
  seekBy(deltaSeconds: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  isPlaying(): boolean;
  setVolume(level: number): void;
  mute(): void;
  unMute(): void;
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;
  getAvailablePlaybackRates(): number[];
  setCaptionsEnabled(enabled: boolean): void;
  getVideoTitle(): string;
  onProgress(callback: (progress: PlayerProgress) => void): () => void;
  onStateChange(callback: (state: number) => void): () => void;
  destroy(): void;
}
