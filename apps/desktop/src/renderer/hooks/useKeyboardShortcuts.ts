import { useEffect } from "react";

export interface ShortcutHandlers {
  togglePlay: () => void;
  seekBy: (seconds: number) => void;
  seekToFraction: (fraction: number) => void;
  changeVolume: (delta: number) => void;
  toggleMute: () => void;
  toggleFullscreen: () => void;
  nextInQueue: () => void;
  previousInQueue: () => void;
  openVideoInput: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

/**
 * Atalhos do player. O embed roda com disablekb=1 (os atalhos do YouTube não
 * chegam até aqui), então estes são os únicos — e sem eles o app só funciona
 * acertando botões de 28 px com o mouse.
 *
 * Ficam desligados enquanto a pessoa digita num campo.
 */
export function useKeyboardShortcuts(
  handlers: ShortcutHandlers,
  enabled: boolean
): void {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      const meta = event.metaKey || event.ctrlKey;

      // ⌘L: colar um link novo, como na barra de endereços do navegador.
      if (meta && event.key.toLowerCase() === "l") {
        event.preventDefault();
        handlers.openVideoInput();
        return;
      }

      if (meta || event.altKey) return;

      switch (event.key) {
        case " ":
        case "k":
        case "K":
          event.preventDefault();
          handlers.togglePlay();
          break;
        case "ArrowLeft":
          event.preventDefault();
          handlers.seekBy(event.shiftKey ? -30 : -5);
          break;
        case "ArrowRight":
          event.preventDefault();
          handlers.seekBy(event.shiftKey ? 30 : 5);
          break;
        case "j":
        case "J":
          event.preventDefault();
          handlers.seekBy(-10);
          break;
        case "l":
        case "L":
          event.preventDefault();
          handlers.seekBy(10);
          break;
        case "ArrowUp":
          event.preventDefault();
          handlers.changeVolume(5);
          break;
        case "ArrowDown":
          event.preventDefault();
          handlers.changeVolume(-5);
          break;
        case "m":
        case "M":
          event.preventDefault();
          handlers.toggleMute();
          break;
        case "f":
        case "F":
          event.preventDefault();
          handlers.toggleFullscreen();
          break;
        case "n":
        case "N":
          event.preventDefault();
          handlers.nextInQueue();
          break;
        case "p":
        case "P":
          event.preventDefault();
          handlers.previousInQueue();
          break;
        default:
          // 0-9: pular para a fração correspondente do vídeo
          if (/^[0-9]$/.test(event.key)) {
            event.preventDefault();
            handlers.seekToFraction(parseInt(event.key, 10) / 10);
          }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlers, enabled]);
}
