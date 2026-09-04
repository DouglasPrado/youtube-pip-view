import { ClipboardPaste } from "lucide-react";
import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { mediaKey, parseMediaUrl } from "@ytview/youtube-utils";
import { strings } from "../strings";

interface VideoInputProps {
  isVisible: boolean;
  onClose: () => void;
  onSubmit: (videoId: string, startSeconds: number) => void;
  currentVideoId: string | null;
}

export function VideoInput({
  isVisible,
  onClose,
  onSubmit,
  currentVideoId,
}: VideoInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [clipboardSuggestion, setClipboardSuggestion] = useState<string | null>(
    null
  );
  const inputRef = useRef<HTMLInputElement>(null);
  // onClose muda de identidade a cada render do App. Guardar numa ref deixa o
  // efeito abaixo depender só de isVisible - senão ele roda de novo a cada
  // render e o setInputValue("") apaga o que a pessoa está digitando.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isVisible) {
      setClipboardSuggestion(null);
      return;
    }

    inputRef.current?.focus();
    setInputValue("");
    setError(null);
    setClipboardSuggestion(null);

    // Só preencher sozinho quando o que está copiado é mesmo um vídeo. Se for
    // outra coisa qualquer, não encher o campo de lixo que a pessoa vai ter
    // que apagar.
    const readClipboard = async () => {
      try {
        const text = await navigator.clipboard.readText();
        const trimmed = text?.trim();
        if (!trimmed) return;

        if (parseMediaUrl(trimmed)) {
          setInputValue(trimmed);
          inputRef.current?.select();
        } else {
          setClipboardSuggestion(trimmed);
        }
      } catch {
        // Sem permissão de clipboard: seguir sem sugestão
      }
    };
    readClipboard();
  }, [isVisible]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isVisible) {
        onCloseRef.current();
      }
    };

    if (isVisible) {
      window.addEventListener("keydown", handleEscape as any);
      return () => {
        window.removeEventListener("keydown", handleEscape as any);
      };
    }
  }, [isVisible]);

  const handleSubmit = () => {
    const trimmedValue = inputValue.trim();

    if (!trimmedValue) {
      setError(strings.input.empty);
      inputRef.current?.focus();
      return;
    }

    const ref = parseMediaUrl(trimmedValue);

    if (!ref) {
      setError(strings.input.invalid);
      inputRef.current?.focus();
      return;
    }

    // Reenviar o vídeo que já está tocando é um pedido legítimo: recomeçar.
    setError(null);
    onSubmit(mediaKey(ref), ref.startSeconds);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSubmit();
    }
  };

  const usePastedText = () => {
    if (!clipboardSuggestion) return;
    setInputValue(clipboardSuggestion);
    setClipboardSuggestion(null);
    setError(null);
    inputRef.current?.focus();
  };

  if (!isVisible) {
    return null;
  }

  const isSameVideo =
    currentVideoId !== null &&
    (() => {
      const ref = parseMediaUrl(inputValue.trim());
      return ref ? mediaKey(ref) === currentVideoId : false;
    })();

  return (
    <div
      className="video-input-overlay"
      onClick={(e) => {
        // Só fechar se clicar diretamente no overlay, não nos elementos filhos
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="video-input-container"
        onClick={(e) => e.stopPropagation()}
      >
        <label htmlFor="video-input" className="video-input-label">
          {strings.input.label}
        </label>
        <input
          id="video-input"
          ref={inputRef}
          type="text"
          className={`video-input-field ${error ? "error" : ""}`}
          placeholder={strings.input.placeholder}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
        {error && <span className="video-input-error">{error}</span>}

        {clipboardSuggestion && !error && (
          <button className="video-input-clipboard" onClick={usePastedText}>
            <ClipboardPaste size={13} />
            {strings.input.usePasted}
          </button>
        )}

        <div className="video-input-actions">
          <button
            className="video-input-button secondary"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
          >
            {strings.input.cancel}
          </button>
          <button
            className="video-input-button primary"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSubmit();
            }}
          >
            {isSameVideo ? strings.input.restart : strings.input.play}
          </button>
        </div>
      </div>
    </div>
  );
}
