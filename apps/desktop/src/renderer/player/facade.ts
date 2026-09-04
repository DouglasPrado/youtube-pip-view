import { PLAYER_STATE } from "./types";
import type { PlayerFacade, PlayerLoadError, PlayerProgress } from "./types";

interface CreateOptions {
  container: HTMLElement;
  /**
   * Vídeo inicial. O player precisa nascer com um: criado em /embed/ vazio,
   * ele fica preso em BUFFERING e loadVideoById não o recupera.
   */
  videoId: string;
  startSeconds?: number;
  onReady: (facade: PlayerFacade) => void;
  onPlaybackStarted?: () => void;
  onError?: (error: PlayerLoadError) => void;
}

const ERROR_MESSAGES: Record<number, PlayerLoadError> = {
  2: {
    code: 2,
    message: "Esse endereço de vídeo não é válido.",
    canOpenOnYouTube: false,
  },
  5: {
    code: 5,
    message: "O YouTube não conseguiu tocar esse vídeo aqui.",
    canOpenOnYouTube: true,
  },
  100: {
    code: 100,
    message: "Vídeo não encontrado. Ele pode ter sido removido ou ser privado.",
    canOpenOnYouTube: false,
  },
  101: {
    code: 101,
    message: "O dono desse vídeo não permite tocá-lo fora do YouTube.",
    canOpenOnYouTube: true,
  },
  150: {
    code: 150,
    message: "O dono desse vídeo não permite tocá-lo fora do YouTube.",
    canOpenOnYouTube: true,
  },
};

function describeError(code: unknown): PlayerLoadError {
  const numeric = typeof code === "number" ? code : -1;
  return (
    ERROR_MESSAGES[numeric] ?? {
      code: numeric,
      message: "Não foi possível tocar esse vídeo.",
      canOpenOnYouTube: true,
    }
  );
}

/**
 * Espera a IFrame API do YouTube ficar disponível. O script é carregado pelo
 * index.html; aqui só aguardamos o objeto aparecer.
 */
function whenApiReady(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();

  return new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };

    // Rede lenta ou script já executado antes deste listener: conferir também
    // por conta própria.
    const interval = setInterval(() => {
      if (window.YT?.Player) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
  });
}

export async function createPlayerFacade({
  container,
  videoId,
  startSeconds = 0,
  onReady,
  onPlaybackStarted,
  onError,
}: CreateOptions): Promise<void> {
  await whenApiReady();

  const mount = document.createElement("div");
  mount.className = "ytview-media-frame";
  container.appendChild(mount);

  let progressListeners: Array<(progress: PlayerProgress) => void> = [];
  let stateListeners: Array<(state: number) => void> = [];
  let progressTimer: ReturnType<typeof setInterval> | null = null;
  let hasStartedCurrentVideo = false;
  let destroyed = false;

  const player = new window.YT.Player(mount, {
    host: "https://www.youtube.com",
    videoId,
    playerVars: {
      autoplay: 1,
      start: Math.max(0, Math.floor(startSeconds)),
      controls: 0,
      rel: 0,
      playsinline: 1,
      modestbranding: 1,
      fs: 0,
      // Os atalhos são nossos (ver useKeyboardShortcuts); os do YouTube ficam
      // desligados para não competirem.
      disablekb: 1,
      iv_load_policy: 3,
      cc_load_policy: 0,
      origin: window.location.origin,
    },
    events: {
      onReady: () => {
        if (destroyed) return;
        startProgressLoop();
        onReady(facade);
      },
      onStateChange: (event: { data: number }) => {
        if (destroyed) return;

        if (event.data === PLAYER_STATE.PLAYING && !hasStartedCurrentVideo) {
          hasStartedCurrentVideo = true;
          onPlaybackStarted?.();
        }

        stateListeners.forEach((listener) => listener(event.data));
        emitProgress();
      },
      onError: (event: { data: number }) => {
        if (destroyed) return;
        onError?.(describeError(event.data));
      },
    },
  });

  function safeNumber(read: () => number): number {
    try {
      const value = read();
      return typeof value === "number" && isFinite(value) && value >= 0
        ? value
        : 0;
    } catch {
      return 0;
    }
  }

  function emitProgress() {
    if (destroyed || progressListeners.length === 0) return;
    const progress: PlayerProgress = {
      currentTime: safeNumber(() => player.getCurrentTime()),
      duration: safeNumber(() => player.getDuration()),
    };
    progressListeners.forEach((listener) => listener(progress));
  }

  function startProgressLoop() {
    if (progressTimer) return;
    // Tempo lido do player, não estimado por relógio: pausa, buffering e
    // seek pelo próprio YouTube ficam refletidos sem desencontro.
    progressTimer = setInterval(emitProgress, 250);
  }

  const facade: PlayerFacade = {
    provider: "youtube",
    capabilities: { seek: true, speed: true, captions: true },

    load(videoId: string, startSeconds = 0) {
      hasStartedCurrentVideo = false;
      try {
        player.loadVideoById({ videoId, startSeconds });
      } catch (error) {
        console.error("Erro ao carregar vídeo:", error);
      }
    },
    play() {
      try {
        player.playVideo();
      } catch {
        /* player ainda não pronto */
      }
    },
    pause() {
      try {
        player.pauseVideo();
      } catch {
        /* player ainda não pronto */
      }
    },
    togglePlay() {
      if (facade.isPlaying()) {
        facade.pause();
      } else {
        facade.play();
      }
    },
    seekTo(seconds: number) {
      const duration = facade.getDuration();
      const target = Math.max(0, duration > 0 ? Math.min(seconds, duration) : seconds);
      try {
        player.seekTo(target, true);
      } catch {
        /* player ainda não pronto */
      }
      emitProgress();
    },
    seekBy(deltaSeconds: number) {
      facade.seekTo(facade.getCurrentTime() + deltaSeconds);
    },
    getCurrentTime() {
      return safeNumber(() => player.getCurrentTime());
    },
    getDuration() {
      return safeNumber(() => player.getDuration());
    },
    getPlayerState() {
      try {
        return player.getPlayerState();
      } catch {
        return PLAYER_STATE.UNSTARTED;
      }
    },
    isPlaying() {
      const state = facade.getPlayerState();
      return state === PLAYER_STATE.PLAYING || state === PLAYER_STATE.BUFFERING;
    },
    setVolume(level: number) {
      try {
        player.setVolume(Math.max(0, Math.min(100, level)));
      } catch {
        /* player ainda não pronto */
      }
    },
    mute() {
      try {
        player.mute();
      } catch {
        /* player ainda não pronto */
      }
    },
    unMute() {
      try {
        player.unMute();
      } catch {
        /* player ainda não pronto */
      }
    },
    setPlaybackRate(rate: number) {
      try {
        player.setPlaybackRate(rate);
      } catch {
        /* player ainda não pronto */
      }
    },
    getPlaybackRate() {
      try {
        return player.getPlaybackRate() || 1;
      } catch {
        return 1;
      }
    },
    getAvailablePlaybackRates() {
      try {
        const rates = player.getAvailablePlaybackRates();
        return Array.isArray(rates) && rates.length > 0
          ? rates
          : [0.5, 0.75, 1, 1.25, 1.5, 2];
      } catch {
        return [0.5, 0.75, 1, 1.25, 1.5, 2];
      }
    },
    setCaptionsEnabled(enabled: boolean) {
      try {
        if (enabled) {
          player.loadModule("captions");
          player.setOption("captions", "track", { languageCode: "" });
        } else {
          player.unloadModule("captions");
        }
      } catch {
        /* nem todo vídeo tem legendas */
      }
    },
    getVideoTitle() {
      try {
        return player.getVideoData()?.title ?? "";
      } catch {
        return "";
      }
    },
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
      if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = null;
      }
      progressListeners = [];
      stateListeners = [];
      try {
        player.destroy();
      } catch {
        /* já destruído */
      }
    },
  };
}
