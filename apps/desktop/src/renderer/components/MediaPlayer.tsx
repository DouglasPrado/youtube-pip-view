import { Maximize, Minimize2, Minus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PlayerFacade, PlayerLoadError } from "../player/types";
import { createPlayerFor } from "../player/create";
import { parseMediaKey } from "@ytview/youtube-utils";
import { strings } from "../strings";

interface MediaPlayerProps {
  videoId: string | null;
  playKey?: number;
  /** Segundo em que o vídeo deve começar (retomada ou &t= do link). */
  startSeconds?: number;
  onPlayerClick: () => void;
  onPlayerReady?: (player: PlayerFacade) => void;
  /** Chamado quando o vídeo começa a tocar de fato (fim do carregamento). */
  onPlaybackStarted?: () => void;
  onError?: (error: PlayerLoadError | null) => void;
  showControls?: boolean;
  title?: string | null;
}

export function MediaPlayer({
  videoId,
  playKey = 0,
  startSeconds = 0,
  onPlayerClick,
  onPlayerReady,
  onPlaybackStarted,
  onError,
  showControls = false,
  title,
}: MediaPlayerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [facade, setFacade] = useState<PlayerFacade | null>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const facadeRef = useRef<PlayerFacade | null>(null);
  const creatingRef = useRef(false);
  const providerRef = useRef<string | null>(null);
  // Criar um player é assíncrono (SDK, handshake). Sem este contador, o
  // onReady de um player já descartado chegava depois e tomava o lugar do novo.
  const generationRef = useRef(0);
  const lastLoadRef = useRef<string>("");

  // Callbacks em refs: mudam de identidade a cada render do App e não podem
  // derrubar o player.
  const callbacksRef = useRef({ onPlayerReady, onPlaybackStarted, onError });
  callbacksRef.current = { onPlayerReady, onPlaybackStarted, onError };

  // O player nasce já com o vídeo (um embed vazio fica preso em BUFFERING) e
  // é recriado quando o serviço muda: cada um tem seu próprio SDK.
  useEffect(() => {
    if (!mountRef.current || !videoId) return;

    const media = parseMediaKey(videoId);
    const sameProvider = providerRef.current === media.provider;


    if (facadeRef.current && sameProvider) return;
    if (creatingRef.current && sameProvider) return;

    // Trocou de serviço: o player anterior sai de cena junto com o iframe dele,
    // e qualquer criação em andamento fica órfã (ver generationRef).
    generationRef.current++;
    creatingRef.current = false;
    facadeRef.current?.destroy();
    facadeRef.current = null;
    setFacade(null);
    mountRef.current.replaceChildren();

    providerRef.current = media.provider;
    creatingRef.current = true;
    lastLoadRef.current = `${videoId}:${playKey}:${startSeconds}`;

    const generation = ++generationRef.current;
    const atual = () => generation === generationRef.current;

    void createPlayerFor({
      container: mountRef.current,
      media: { ...media, startSeconds },
      onReady: (readyFacade) => {
        if (!atual()) {
          // Chegou tarde: já trocamos de serviço.
          readyFacade.destroy();
          return;
        }
        creatingRef.current = false;
        facadeRef.current = readyFacade;
        setFacade(readyFacade);
        callbacksRef.current.onPlayerReady?.(readyFacade);
      },
      onPlaybackStarted: () => {
        if (atual()) callbacksRef.current.onPlaybackStarted?.();
      },
      onError: (error) => {
        if (!atual()) return;
        creatingRef.current = false;
        callbacksRef.current.onError?.(error);
      },
    });
  }, [videoId, playKey, startSeconds]);

  // Desmontagem: soltar o player.
  useEffect(() => {
    return () => {
      facadeRef.current?.destroy();
      facadeRef.current = null;
    };
  }, []);

  // Trocar de vídeo dentro do mesmo serviço: só recarrega.
  useEffect(() => {
    if (!facade || !videoId) return;

    const media = parseMediaKey(videoId);
    // Enquanto o player do novo serviço é criado, este ainda é o do serviço
    // anterior — mandar o id novo para ele carregaria lixo (o Vimeo recebendo
    // um id do Dailymotion, por exemplo).
    if (facade.provider !== media.provider) return;

    const signature = `${videoId}:${playKey}:${startSeconds}`;
    if (lastLoadRef.current === signature) return;
    lastLoadRef.current = signature;

    callbacksRef.current.onError?.(null);
    facade.load(media.id, startSeconds);
  }, [facade, videoId, playKey, startSeconds]);

  const handleMinimize = async () => {
    facadeRef.current?.pause();
    try {
      await window.electronAPI?.minimizeWindow();
    } catch (error) {
      console.error("Erro ao minimizar:", error);
    }
  };

  const handleToggleFullscreen = async () => {
    if (!window.electronAPI?.toggleFullscreen) return;
    try {
      setIsFullscreen(await window.electronAPI.toggleFullscreen());
    } catch (error) {
      console.error("Erro ao alternar tela cheia:", error);
    }
  };

  const handleClose = () => {
    window.electronAPI?.closeWindow();
  };

  const windowButtons = (
    <div className="window-buttons">
      <button
        type="button"
        className="window-button"
        onClick={handleMinimize}
        title={strings.player.hideHint}
        aria-label={strings.player.hide}
      >
        <Minus size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="window-button"
        onClick={handleToggleFullscreen}
        title={isFullscreen ? strings.player.exitFullscreen : strings.player.fullscreen}
        aria-label={isFullscreen ? strings.player.exitFullscreen : strings.player.fullscreen}
      >
        {isFullscreen ? (
          <Minimize2 size={16} aria-hidden="true" />
        ) : (
          <Maximize size={16} aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        className="window-button"
        onClick={handleClose}
        title={strings.player.closeHint}
        aria-label={strings.player.close}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <div
      className={`youtube-player-container ${showControls ? "show-controls" : ""} ${
        facade?.capabilities.nativeControls ? "native-controls" : ""
      }`}
    >
      {/* O player do serviço (YouTube, Vimeo, Twitch, Dailymotion) monta aqui. */}
      <div className="youtube-iframe-mount" ref={mountRef} />

      {!videoId && (
        <button
          type="button"
          className="empty-state"
          onClick={onPlayerClick}
          aria-label={strings.player.emptyAria}
        >
          <span className="empty-state-icon" aria-hidden="true">
            ▶
          </span>
          <span className="empty-state-text">{strings.player.emptyTitle}</span>
          <span className="empty-state-hint">{strings.player.emptyHint}</span>
        </button>
      )}

      {videoId && title && (
        <div className="video-title" title={title}>
          {title}
        </div>
      )}

      {windowButtons}
    </div>
  );
}
