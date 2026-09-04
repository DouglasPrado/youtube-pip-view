import { PLAYER_STATE } from "./types";
import type { PlayerFacade, PlayerLoadError, PlayerProgress } from "./types";

interface CreateOptions {
  container: HTMLElement;
  videoId: string;
  startSeconds?: number;
  onReady: (facade: PlayerFacade) => void;
  onPlaybackStarted?: () => void;
  onError?: (error: PlayerLoadError) => void;
}

const ORIGIN = "https://www.dailymotion.com";

/**
 * Player do Dailymotion.
 *
 * Aqui o vídeo é operado pelos controles do próprio Dailymotion, e não pela
 * barra do YTView. Motivo: a API de postMessage do embed aberto não responde
 * mais (testado: nenhum evento chega), e a API nova exige um player criado
 * numa conta de parceiro. Em vez de oferecer botões que não fazem nada, o
 * app entrega o player do serviço e some com a própria barra.
 */
export async function createDailymotionPlayer({
  container,
  videoId,
  startSeconds = 0,
  onReady,
  onPlaybackStarted,
  onError,
}: CreateOptions): Promise<void> {
  const iframe = document.createElement("iframe");
  iframe.className = "ytview-media-frame";
  iframe.allow = "autoplay; fullscreen; encrypted-media";
  iframe.setAttribute("frameborder", "0");
  container.appendChild(iframe);

  let progressListeners: Array<(progress: PlayerProgress) => void> = [];
  let stateListeners: Array<(state: number) => void> = [];
  let currentTime = 0;
  let duration = 0;
  let playing = false;
  let started = false;
  let ready = false;
  let destroyed = false;

  const embedUrl = (id: string, start: number) => {
    const params = new URLSearchParams({
      controls: "true",
      autoplay: "true",
      "queue-enable": "false",
      "sharing-enable": "false",
      "ui-logo": "false",
      origin: window.location.origin,
    });
    if (start > 0) params.set("start", String(Math.floor(start)));
    return `${ORIGIN}/embed/video/${id}?${params.toString()}`;
  };

  const send = (command: string, ...parameters: unknown[]) => {
    iframe.contentWindow?.postMessage({ command, parameters }, ORIGIN);
  };

  const emitProgress = () => {
    if (destroyed) return;
    progressListeners.forEach((listener) => listener({ currentTime, duration }));
  };

  const emitState = (state: number) => {
    if (destroyed) return;
    stateListeners.forEach((listener) => listener(state));
  };

  const facade: PlayerFacade = {
    provider: "dailymotion",
    capabilities: {
      seek: false,
      speed: false,
      captions: false,
      nativeControls: true,
    },

    load(nextId: string, nextStart = 0) {
      started = false;
      ready = false;
      currentTime = 0;
      duration = 0;
      iframe.src = embedUrl(nextId, nextStart);
    },
    play: () => send("play"),
    pause: () => send("pause"),
    togglePlay() {
      if (playing) facade.pause();
      else facade.play();
    },
    seekTo(seconds: number) {
      const target = Math.max(0, duration > 0 ? Math.min(seconds, duration) : seconds);
      currentTime = target;
      emitProgress();
      send("seek", target);
    },
    seekBy(delta: number) {
      facade.seekTo(currentTime + delta);
    },
    getCurrentTime: () => currentTime,
    getDuration: () => duration,
    getPlayerState: () => (playing ? PLAYER_STATE.PLAYING : PLAYER_STATE.PAUSED),
    isPlaying: () => playing,
    setVolume(level: number) {
      // O Dailymotion trabalha de 0 a 1.
      send("volume", Math.max(0, Math.min(100, level)) / 100);
    },
    mute: () => send("muted", true),
    unMute: () => send("muted", false),
    setPlaybackRate() {
      /* não exposto pelo embed */
    },
    getPlaybackRate: () => 1,
    getAvailablePlaybackRates: () => [1],
    setCaptionsEnabled() {
      /* não exposto pelo embed */
    },
    getVideoTitle: () => "",
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
      window.removeEventListener("message", onMessage);
      progressListeners = [];
      stateListeners = [];
      iframe.remove();
    },
  };

  function onMessage(event: MessageEvent) {
    if (destroyed || event.source !== iframe.contentWindow) return;

    // O embed manda ora objeto, ora querystring ("event=timeupdate&time=3").
    const data =
      typeof event.data === "string"
        ? Object.fromEntries(new URLSearchParams(event.data))
        : (event.data as Record<string, unknown>);

    const name = String(data?.event ?? "");
    if (!name) return;

    switch (name) {
      case "apiready":
        if (!ready) {
          ready = true;
          onReady(facade);
        }
        break;
      case "timeupdate":
        currentTime = Number(data.time ?? currentTime) || 0;
        emitProgress();
        break;
      case "durationchange":
        duration = Number(data.duration ?? duration) || 0;
        emitProgress();
        break;
      case "playing":
      case "play":
        playing = true;
        if (!started) {
          started = true;
          onPlaybackStarted?.();
        }
        emitState(PLAYER_STATE.PLAYING);
        break;
      case "pause":
        playing = false;
        emitState(PLAYER_STATE.PAUSED);
        break;
      case "video_end":
      case "end":
        playing = false;
        emitState(PLAYER_STATE.ENDED);
        break;
      case "error":
        onError?.({
          code: -1,
          message: "Não foi possível tocar esse vídeo do Dailymotion.",
          canOpenOnYouTube: true,
        });
        break;
    }
  }

  window.addEventListener("message", onMessage);
  iframe.src = embedUrl(videoId, startSeconds);

  // O embed não avisa quando está pronto: o player fica utilizável assim que
  // o iframe carrega.
  iframe.addEventListener("load", () => {
    if (!ready && !destroyed) {
      ready = true;
      onPlaybackStarted?.();
      onReady(facade);
    }
  });

  setTimeout(() => {
    if (!ready && !destroyed) {
      ready = true;
      onReady(facade);
    }
  }, 4000);
}
