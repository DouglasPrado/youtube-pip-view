import { AlertCircle } from "lucide-react";
import type { PlayerLoadError } from "../player/types";
import { strings } from "../strings";

interface PlayerErrorProps {
  error: PlayerLoadError;
  hasNextInQueue: boolean;
  onOpenInYouTube: () => void;
  onPlayNext: () => void;
  onChangeVideo: () => void;
}

/**
 * O que aparece quando o vídeo não pode tocar (removido, privado ou com
 * incorporação bloqueada). Sem isto, o aviso do YouTube fica dentro do iframe,
 * que não recebe cliques — um beco sem saída.
 */
export function PlayerError({
  error,
  hasNextInQueue,
  onOpenInYouTube,
  onPlayNext,
  onChangeVideo,
}: PlayerErrorProps) {
  return (
    <div className="player-error" role="alert">
      <div className="player-error-content">
        <AlertCircle size={28} aria-hidden="true" />
        <p className="player-error-message">{error.message}</p>
        <div className="player-error-actions">
          {error.canOpenOnYouTube && (
            <button
              type="button"
              className="player-error-button primary"
              onClick={onOpenInYouTube}
            >
              {strings.error.openOnYouTube}
            </button>
          )}
          {hasNextInQueue && (
            <button
              type="button"
              className="player-error-button"
              onClick={onPlayNext}
            >
              {strings.error.playNext}
            </button>
          )}
          <button
            type="button"
            className="player-error-button"
            onClick={onChangeVideo}
          >
            {strings.error.changeVideo}
          </button>
        </div>
      </div>
    </div>
  );
}
