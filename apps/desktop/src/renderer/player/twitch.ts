import { PLAYER_STATE } from "./types";
import type { PlayerFacade, PlayerLoadError, PlayerProgress } from "./types";
import { loadScript } from "./load-script";
import type { TwitchKind } from "@ytview/youtube-utils";

interface CreateOptions {
  container: HTMLElement;
  videoId: string;
  kind: TwitchKind;
  startSeconds?: number;
  onReady: (facade: PlayerFacade) => void;
  onPlaybackStarted?: () => void;
  onError?: (error: PlayerLoadError) => void;
}

const SDK_URL = "https://player.twitch.tv/js/embed/v1.js";

/**
 * Player do Twitch pelo embed oficial.
 *
 * Três coisas moram atrás do mesmo domínio — VOD, clipe e canal ao vivo — e
 * elas se comportam diferente: uma transmissão não tem duração nem barra de
 * progresso, então o app esconde o que não faz sentido (ver capabilities).
 */
export async function createTwitchPlayer({
  container,
  videoId,
  kind,
  startSeconds = 0,
  onReady,
  onPlaybackStarted,
  onError,
}: CreateOptions): Promise<void> {
  await loadScript(SDK_URL, () => Boolean((window as any).Twitch?.Player));

  const mount = document.createElement("div");
  mount.className = "ytview-media-frame";
  container.appendChild(mount);

  const Twitch = (window as any).Twitch;
  const isLive = kind === "channel";

  let progressListeners: Array<(progress: PlayerProgress) => void> = [];
  let stateListeners: Array<(state: number) => void> = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  let started = false;
  let destroyed = false;

  const options: Record<string, unknown> = {
    width: "100%",
    height: "100%",
    autoplay: true,
    muted: false,
    // O Twitch exige declarar quem hospeda o iframe. O renderer é servido de
    // localhost (ver main/server.ts).
    parent: ["localhost", "127.0.0.1"],
  };

  if (kind === "video") {
    options.video = videoId;
    if (startSeconds > 0) options.time = `${Math.floor(startSeconds)}s`;
  } else if (kind === "clip") {
    options.video = videoId;
  } else {
    options.channel = videoId;
  }

  let player: any;
  try {
    player = new Twitch.Player(mount, options);
  } catch {
    onError?.({
      code: -1,
      message: "O player do Twitch não carregou.",
      canOpenOnYouTube: true,
    });
    return;
  }

  const safe = <T>(read: () => T, fallback: T): T => {
    try {
      const value = read();
      return value === undefined || value === null ? fallback : value;
    } catch {
      return fallback;
    }
  };

  const emitProgress = () => {
    if (destroyed || progressListeners.length === 0) return;
    const progress: PlayerProgress = {
      currentTime: safe(() => player.getCurrentTime(), 0),
      duration: isLive ? 0 : safe(() => player.getDuration(), 0),
    };
    progressListeners.forEach((listener) => listener(progress));
  };

  const emitState = (state: number) => {
    if (destroyed) return;
    stateListeners.forEach((listener) => listener(state));
  };

  player.addEventListener(Twitch.Player.READY, () => {
    if (destroyed) return;
    timer = setInterval(emitProgress, 250);
    onReady(facade);
  });

  player.addEventListener(Twitch.Player.PLAY, () => {
    if (!started) {
      started = true;
      onPlaybackStarted?.();
    }
    emitState(PLAYER_STATE.PLAYING);
  });

  player.addEventListener(Twitch.Player.PAUSE, () =>
    emitState(PLAYER_STATE.PAUSED)
  );

  player.addEventListener(Twitch.Player.ENDED, () =>
    emitState(PLAYER_STATE.ENDED)
  );

  player.addEventListener(Twitch.Player.OFFLINE, () => {
    onError?.({
      code: -1,
      message: "Esse canal não está ao vivo agora.",
      canOpenOnYouTube: true,
    });
  });

  const facade: PlayerFacade = {
    provider: "twitch",
    // Ao vivo não há para onde arrastar, e o Twitch não expõe velocidade.
    capabilities: { seek: !isLive, speed: false, captions: false },

    load(nextId: string, nextStart = 0) {
      started = false;
      try {
        if (isLive) {
          player.setChannel(nextId);
        } else {
          player.setVideo(nextId, Math.floor(nextStart));
        }
      } catch {
        onError?.({
          code: -1,
          message: "Não foi possível carregar esse conteúdo do Twitch.",
          canOpenOnYouTube: true,
        });
      }
    },
    play: () => safe(() => player.play(), undefined),
    pause: () => safe(() => player.pause(), undefined),
    togglePlay() {
      if (facade.isPlaying()) facade.pause();
      else facade.play();
    },
    seekTo(seconds: number) {
      if (isLive) return;
      const duration = facade.getDuration();
      const target = Math.max(0, duration > 0 ? Math.min(seconds, duration) : seconds);
      safe(() => player.seek(target), undefined);
      emitProgress();
    },
    seekBy(delta: number) {
      facade.seekTo(facade.getCurrentTime() + delta);
    },
    getCurrentTime: () => safe(() => player.getCurrentTime(), 0),
    getDuration: () => (isLive ? 0 : safe(() => player.getDuration(), 0)),
    getPlayerState: () =>
      safe(() => player.isPaused(), true) ? PLAYER_STATE.PAUSED : PLAYER_STATE.PLAYING,
    isPlaying: () => !safe(() => player.isPaused(), true),
    setVolume(level: number) {
      // O Twitch trabalha de 0 a 1.
      safe(() => player.setVolume(Math.max(0, Math.min(100, level)) / 100), undefined);
    },
    mute: () => safe(() => player.setMuted(true), undefined),
    unMute: () => safe(() => player.setMuted(false), undefined),
    setPlaybackRate() {
      /* o Twitch não expõe velocidade */
    },
    getPlaybackRate: () => 1,
    getAvailablePlaybackRates: () => [1],
    setCaptionsEnabled() {
      /* o Twitch não expõe legendas por API */
    },
    getVideoTitle: () => safe(() => player.getChannel(), "") || "",
    onProgress(callback) {
      progressListeners.push(callback);
      emitProgress();
      return () => {
        progressListeners = progressListeners.filter((cb) => cb !== callback);
      };
    },
    onStateChange(callback) {
      stateListeners.push(callback);
      return () => {
        stateListeners = stateListeners.filter((cb) => cb !== callback);
      };
    },
    destroy() {
      destroyed = true;
      if (timer) clearInterval(timer);
      progressListeners = [];
      stateListeners = [];
      safe(() => player.destroy?.(), undefined);
    },
  };
}
