import { PLAYER_STATE } from "./types";
import type { PlayerFacade, PlayerLoadError, PlayerProgress } from "./types";
import { loadScript } from "./load-script";

interface CreateOptions {
  container: HTMLElement;
  videoId: string;
  startSeconds?: number;
  onReady: (facade: PlayerFacade) => void;
  onPlaybackStarted?: () => void;
  onError?: (error: PlayerLoadError) => void;
}

const SDK_URL = "https://player.vimeo.com/api/player.js";

/**
 * Player do Vimeo pelo SDK oficial.
 *
 * O SDK é todo assíncrono (tudo devolve Promise), então o tempo e a duração
 * são espelhados aqui para que getCurrentTime()/getDuration() respondam na
 * hora, como o resto do app espera.
 */
export async function createVimeoPlayer({
  container,
  videoId,
  startSeconds = 0,
  onReady,
  onPlaybackStarted,
  onError,
}: CreateOptions): Promise<void> {
  await loadScript(SDK_URL, () => Boolean((window as any).Vimeo?.Player));

  const mount = document.createElement("div");
  mount.className = "ytview-media-frame";
  container.appendChild(mount);

  let progressListeners: Array<(progress: PlayerProgress) => void> = [];
  let stateListeners: Array<(state: number) => void> = [];
  let currentTime = 0;
  let duration = 0;
  let playing = false;
  let started = false;
  let destroyed = false;
  let title = "";

  const player = new (window as any).Vimeo.Player(mount, {
    // O SDK espera número; string faz o player não montar em silêncio.
    id: Number(videoId),
    autoplay: true,
    controls: false,
    playsinline: true,
    dnt: true,
    title: false,
    byline: false,
    portrait: false,
  });

  const emitProgress = () => {
    if (destroyed) return;
    progressListeners.forEach((listener) =>
      listener({ currentTime, duration })
    );
  };

  const emitState = (state: number) => {
    if (destroyed) return;
    stateListeners.forEach((listener) => listener(state));
  };

  player.on("timeupdate", (data: { seconds: number; duration: number }) => {
    currentTime = data.seconds;
    duration = data.duration;
    emitProgress();
  });

  player.on("durationchange", (data: { duration: number }) => {
    duration = data.duration;
    emitProgress();
  });

  player.on("play", () => {
    playing = true;
    if (!started) {
      started = true;
      onPlaybackStarted?.();
    }
    emitState(PLAYER_STATE.PLAYING);
  });

  player.on("pause", () => {
    playing = false;
    emitState(PLAYER_STATE.PAUSED);
  });

  player.on("ended", () => {
    playing = false;
    emitState(PLAYER_STATE.ENDED);
  });

  player.on("error", (data: { name?: string; message?: string }) => {
    onError?.({
      code: -1,
      message:
        data?.name === "PrivacyError"
          ? "Esse vídeo do Vimeo não permite ser tocado fora do site."
          : data?.message || "Não foi possível tocar esse vídeo do Vimeo.",
      canOpenOnYouTube: true,
    });
  });

  const facade: PlayerFacade = {
    provider: "vimeo",
    capabilities: { seek: true, speed: false, captions: false },

    load(nextId: string, nextStart = 0) {
      started = false;
      currentTime = 0;
      duration = 0;
      void player
        .loadVideo(Number(nextId))
        .then(() => {
          if (nextStart > 0) return player.setCurrentTime(nextStart);
        })
        .then(() => player.play())
        .catch(() => {
          onError?.({
            code: -1,
            message: "Não foi possível carregar esse vídeo do Vimeo.",
            canOpenOnYouTube: true,
          });
        });
    },
    play() {
      void player.play().catch(() => undefined);
    },
    pause() {
      void player.pause().catch(() => undefined);
    },
    togglePlay() {
      if (playing) facade.pause();
      else facade.play();
    },
    seekTo(seconds: number) {
      const target = Math.max(0, duration > 0 ? Math.min(seconds, duration) : seconds);
      currentTime = target;
      emitProgress();
      void player.setCurrentTime(target).catch(() => undefined);
    },
    seekBy(delta: number) {
      facade.seekTo(currentTime + delta);
    },
    getCurrentTime: () => currentTime,
    getDuration: () => duration,
    getPlayerState: () => (playing ? PLAYER_STATE.PLAYING : PLAYER_STATE.PAUSED),
    isPlaying: () => playing,
    setVolume(level: number) {
      // O Vimeo trabalha de 0 a 1.
      void player.setVolume(Math.max(0, Math.min(100, level)) / 100).catch(() => undefined);
    },
    mute() {
      void player.setMuted(true).catch(() => undefined);
    },
    unMute() {
      void player.setMuted(false).catch(() => undefined);
    },
    setPlaybackRate(rate: number) {
      void player.setPlaybackRate(rate).catch(() => undefined);
    },
    getPlaybackRate: () => 1,
    getAvailablePlaybackRates: () => [0.5, 0.75, 1, 1.25, 1.5, 2],
    setCaptionsEnabled() {
      /* o SDK exige escolher a faixa por idioma; fora do escopo */
    },
    getVideoTitle: () => title,
    onProgress(callback) {
      progressListeners.push(callback);
      callback({ currentTime, duration });
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
      progressListeners = [];
      stateListeners = [];
      void player.destroy?.().catch?.(() => undefined);
    },
  };

  void player
    .ready()
    .then(async () => {
      if (destroyed) return;
      title = await player.getVideoTitle().catch(() => "");
      duration = await player.getDuration().catch(() => 0);
      if (startSeconds > 0) await player.setCurrentTime(startSeconds).catch(() => undefined);
      onReady(facade);
    })
    .catch(() => {
      onError?.({
        code: -1,
        message: "O player do Vimeo não carregou.",
        canOpenOnYouTube: true,
      });
    });
}
