import { useCallback, useEffect, useRef, useState } from "react";
import { Onboarding } from "./components/Onboarding";
import { PlayerError } from "./components/PlayerError";
import { VideoControls } from "./components/VideoControls";
import { VideoInput } from "./components/VideoInput";
import { MediaPlayer } from "./components/MediaPlayer";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { PLAYER_STATE } from "./player/types";
import type { PlayerFacade, PlayerLoadError } from "./player/types";
import "./styles/app.css";

const CONTROLS_HIDE_DELAY = 2500;

export function App() {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [startSeconds, setStartSeconds] = useState(0);
  const [playKey, setPlayKey] = useState(0);
  const [videoTitle, setVideoTitle] = useState<string | null>(null);
  const [playerError, setPlayerError] = useState<PlayerLoadError | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [player, setPlayer] = useState<PlayerFacade | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [controlsPinned, setControlsPinned] = useState(false);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [hasNextInQueue, setHasNextInQueue] = useState(false);

  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const mutedRef = useRef(isMuted);
  mutedRef.current = isMuted;
  const videoIdRef = useRef(videoId);
  videoIdRef.current = videoId;
  const playerRef = useRef<PlayerFacade | null>(null);
  playerRef.current = player;

  // ===== Carregamento inicial =====

  useEffect(() => {
    const loadStoredState = async () => {
      if (!window.electronAPI) {
        console.error("electronAPI não está disponível");
        setShowInput(true);
        return;
      }

      try {
        const [storedVolume, storedMuted, seenOnboarding] = await Promise.all([
          window.electronAPI.getStoredVolume(),
          window.electronAPI.getStoredMuted(),
          window.electronAPI.hasSeenOnboarding(),
        ]);

        if (typeof storedVolume === "number") setVolume(storedVolume);
        setIsMuted(Boolean(storedMuted));
        setShowOnboarding(!seenOnboarding);

        const storedVideoId = await window.electronAPI.getStoredVideo();
        if (storedVideoId) {
          // Retomar de onde parou. Abaixo de 10s não vale a pena.
          const savedPosition = await window.electronAPI
            .getVideoPosition(storedVideoId)
            .catch(() => 0);
          setStartSeconds(savedPosition > 10 ? Math.floor(savedPosition) : 0);
          setVideoId(storedVideoId);
          setIsLoading(true);
          // O vídeo retomado também é "o que está tocando": sem isto a fila
          // abria sem nenhum item marcado, mesmo com um dela no ar.
          void window.electronAPI.setNowPlaying(storedVideoId);
        } else if (seenOnboarding) {
          setShowInput(true);
        }
      } catch (error) {
        console.error("Erro ao carregar estado salvo:", error);
        setShowInput(true);
      }
    };

    loadStoredState();
  }, []);

  // ===== Trocar de vídeo =====

  const playVideo = useCallback(
    async (newVideoId: string, newStartSeconds = 0) => {
      setShowInput(false);
      setPlayerError(null);
      setVideoTitle(null);
      setIsLoading(true);
      setStartSeconds(newStartSeconds);
      setPlayKey((key) => key + 1);
      setVideoId(newVideoId);

      try {
        await window.electronAPI?.saveVideo(newVideoId);
        // Alinhar a fila com o que está tocando: sem isso, um vídeo aberto
        // pelo campo deixa a fila parada quando termina.
        await window.electronAPI?.setNowPlaying(newVideoId);
      } catch (error) {
        console.error("Erro ao salvar vídeo:", error);
      }
    },
    []
  );

  // Comandos vindos do processo principal (fila, extensão, ytview://)
  useEffect(() => {
    if (!window.electronAPI?.onPlayVideo) return;
    return window.electronAPI.onPlayVideo((newVideoId: string) => {
      void playVideo(newVideoId, 0);
    });
  }, [playVideo]);

  // A janela foi escondida (✕, ⌘W, menu da barra, ⌘H): o som para junto.
  useEffect(() => {
    if (!window.electronAPI?.onPausePlayback) return;
    return window.electronAPI.onPausePlayback(() => {
      playerRef.current?.pause();
    });
  }, []);

  // Atalho global de pausa: funciona sem a janela estar em foco.
  useEffect(() => {
    if (!window.electronAPI?.onTogglePlay) return;
    return window.electronAPI.onTogglePlay(() => {
      player?.togglePlay();
    });
  }, [player]);

  // ===== Estado do player =====

  const handlePlayerReady = useCallback((facade: PlayerFacade) => {
    setPlayer(facade);
    facade.setVolume(mutedRef.current ? 0 : volumeRef.current);
    if (mutedRef.current) facade.mute();
  }, []);

  const handlePlaybackStarted = useCallback(() => {
    setIsLoading(false);
  }, []);

  // O título vem do player, mas não fica pronto junto com ele. Depender de
  // "começou a tocar" deixaria a janela sem nome quando o autoplay é barrado.
  useEffect(() => {
    if (!player || !videoId) return;

    let attempts = 0;
    const readTitle = () => {
      const title = player.getVideoTitle();
      if (title) {
        setVideoTitle(title);
        window.electronAPI?.setWindowTitle?.(title);
        return true;
      }
      return false;
    };

    if (readTitle()) return;

    const interval = setInterval(() => {
      attempts += 1;
      if (readTitle() || attempts > 20) clearInterval(interval);
    }, 400);

    return () => clearInterval(interval);
  }, [player, videoId, playKey]);

  const handlePlayerError = useCallback((error: PlayerLoadError | null) => {
    setPlayerError(error);
    if (error) setIsLoading(false);
  }, []);

  // Avisar a fila quando o vídeo acaba (a fila avança sozinha).
  useEffect(() => {
    if (!player) return;
    return player.onStateChange((state) => {
      if (state === PLAYER_STATE.ENDED && videoIdRef.current) {
        window.electronAPI?.notifyVideoEnded(videoIdRef.current);
      }
    });
  }, [player]);

  // Guardar a posição para retomar na próxima abertura.
  useEffect(() => {
    if (!videoId || !player || !window.electronAPI?.saveVideoPosition) return;

    const savePosition = () => {
      const seconds = player.getCurrentTime();
      if (seconds > 0) {
        window.electronAPI.saveVideoPosition(videoId, seconds);
      }
    };

    const interval = setInterval(savePosition, 5000);
    return () => {
      savePosition();
      clearInterval(interval);
    };
  }, [player, videoId]);

  // Saber se há próximo na fila (usado no estado de erro).
  useEffect(() => {
    if (!window.electronAPI?.getQueue) return;

    const check = (state: { items: Array<{ videoId: string }>; currentIndex: number }) => {
      const index = state.items.findIndex((item) => item.videoId === videoId);
      setHasNextInQueue(index >= 0 && index < state.items.length - 1);
    };

    window.electronAPI.getQueue().then(check).catch(() => setHasNextInQueue(false));
    return window.electronAPI.onQueueUpdated?.(check);
  }, [videoId]);

  // ===== Volume e mudo =====

  const handleVolumeChange = useCallback((newVolume: number) => {
    setVolume(newVolume);
    player?.setVolume(newVolume);
    // Nunca gravar 0 como volume: senão o app reabre mudo sem estar mudo.
    if (newVolume > 0) {
      window.electronAPI?.saveVolume(newVolume);
    }
  }, [player]);

  const handleMutedChange = useCallback((muted: boolean) => {
    setIsMuted(muted);
    if (muted) {
      player?.mute();
    } else {
      player?.unMute();
      player?.setVolume(volumeRef.current || 100);
    }
    window.electronAPI?.saveMuted(muted);
  }, [player]);

  // ===== Controles: aparecer com o mouse, sem sumir sob o cursor =====

  useEffect(() => {
    let hideTimeout: ReturnType<typeof setTimeout> | null = null;
    let pointer = { x: -1, y: -1 };

    /**
     * O cursor está sobre algum controle? Esperar pelo mouseenter não basta:
     * quando os controles aparecem embaixo de um cursor parado, o evento
     * nunca dispara — e a barra sumia justamente na hora de clicar nela.
     */
    const pointerIsOverControls = () => {
      if (pointer.x < 0) return false;
      const element = document.elementFromPoint(pointer.x, pointer.y);
      return Boolean(
        element?.closest(".video-controls-container, .window-buttons")
      );
    };

    const scheduleHide = () => {
      if (hideTimeout) clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => {
        if (pointerIsOverControls()) {
          scheduleHide();
          return;
        }
        setShowControls(false);
      }, CONTROLS_HIDE_DELAY);
    };

    const handleMouseMove = (event: MouseEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      setShowControls(true);
      scheduleHide();
    };

    document.addEventListener("mousemove", handleMouseMove, true);
    scheduleHide();

    return () => {
      document.removeEventListener("mousemove", handleMouseMove, true);
      if (hideTimeout) clearTimeout(hideTimeout);
    };
  }, []);

  const controlsVisible = showControls || controlsPinned || showInput;

  // ===== Ações =====

  const openVideoInput = useCallback(() => setShowInput(true), []);
  const closeVideoInput = useCallback(() => setShowInput(false), []);

  const openQueueWindow = useCallback(() => {
    window.electronAPI?.openQueueWindow();
  }, []);

  const openInYouTube = useCallback(() => {
    if (!videoIdRef.current) return;
    let url = `https://www.youtube.com/watch?v=${videoIdRef.current}`;
    const seconds = Math.floor(playerRef.current?.getCurrentTime() ?? 0);
    if (seconds > 0) url += `&t=${seconds}s`;
    window.electronAPI?.openExternalUrl(url);
  }, []);

  const navigateQueue = useCallback(async (direction: "next" | "previous") => {
    if (!window.electronAPI?.getQueue) return;
    const state = await window.electronAPI.getQueue();
    const index = state.items.findIndex(
      (item) => item.videoId === videoIdRef.current
    );
    if (index === -1) return;
    const target = direction === "next" ? index + 1 : index - 1;
    if (target < 0 || target >= state.items.length) return;
    await window.electronAPI.playFromQueue(target);
  }, []);

  const dismissOnboarding = useCallback(() => {
    setShowOnboarding(false);
    window.electronAPI?.markOnboardingSeen();
    if (!videoIdRef.current) setShowInput(true);
  }, []);

  // ===== Atalhos de teclado =====

  useKeyboardShortcuts(
    {
      togglePlay: () => playerRef.current?.togglePlay(),
      seekBy: (seconds) => playerRef.current?.seekBy(seconds),
      seekToFraction: (fraction) => {
        const duration = playerRef.current?.getDuration() ?? 0;
        if (duration > 0) playerRef.current?.seekTo(duration * fraction);
      },
      changeVolume: (delta) => {
        const next = Math.max(0, Math.min(100, volumeRef.current + delta));
        if (mutedRef.current && next > 0) handleMutedChange(false);
        handleVolumeChange(next);
      },
      toggleMute: () => handleMutedChange(!mutedRef.current),
      toggleFullscreen: () => window.electronAPI?.toggleFullscreen(),
      nextInQueue: () => void navigateQueue("next"),
      previousInQueue: () => void navigateQueue("previous"),
      openVideoInput,
    },
    !showInput && !showOnboarding
  );

  return (
    <div className="app-container">
      {/* Camada que captura o mouse: clique pausa, duplo clique vai para tela
          cheia. O iframe do YouTube não recebe eventos. */}
      <div
        className={`mouse-detector-overlay ${
          player?.capabilities.nativeControls ? "pass-through" : ""
        }`}
        onClick={() => {
          if (videoId && !playerError) playerRef.current?.togglePlay();
        }}
        onDoubleClick={() => window.electronAPI?.toggleFullscreen()}
      />

      <MediaPlayer
        videoId={videoId}
        playKey={playKey}
        startSeconds={startSeconds}
        onPlayerClick={openVideoInput}
        onPlayerReady={handlePlayerReady}
        onPlaybackStarted={handlePlaybackStarted}
        onError={handlePlayerError}
        showControls={controlsVisible}
        title={videoTitle}
      />

      {isLoading && !playerError && (
        <div className="loading-spinner" role="status" aria-label="Carregando" />
      )}

      {playerError && (
        <PlayerError
          error={playerError}
          hasNextInQueue={hasNextInQueue}
          onOpenInYouTube={openInYouTube}
          onPlayNext={() => void navigateQueue("next")}
          onChangeVideo={openVideoInput}
        />
      )}

      {videoId && !playerError && (
        <VideoControls
          player={player}
          videoId={videoId}
          showControls={controlsVisible}
          volume={volume}
          isMuted={isMuted}
          onVolumeChange={handleVolumeChange}
          onMutedChange={handleMutedChange}
          onOpenQueue={openQueueWindow}
          onChangeVideo={openVideoInput}
          onOpenInYouTube={openInYouTube}
          onInteractingChange={setControlsPinned}
        />
      )}

      <VideoInput
        isVisible={showInput}
        onClose={closeVideoInput}
        onSubmit={(newVideoId, seconds) => void playVideo(newVideoId, seconds)}
        currentVideoId={videoId}
      />

      {showOnboarding && <Onboarding onDismiss={dismissOnboarding} />}
    </div>
  );
}
