import { useCallback, useEffect, useState } from "react";
import {
  mediaKey,
  mediaThumbnail,
  parseMediaKey,
  parseMediaUrl,
  providerLabel,
} from "@ytview/youtube-utils";
import { strings } from "../strings";
import type { QueueState } from "../api";

const RELEASES_URL = "https://github.com/DouglasPrado/YoutubePiPView/releases";

type AppStatus = "checking" | "online" | "offline";
type Action = "idle" | "sending" | "launching" | "done" | "failed";

interface Response<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

function ask<T>(message: Record<string, unknown>): Promise<Response<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response?: Response<T>) => {
      if (chrome.runtime.lastError || !response) {
        resolve({ ok: false, error: strings.api.noResponse });
        return;
      }
      resolve(response);
    });
  });
}

export function Popup() {
  const [tabVideoId, setTabVideoId] = useState<string | null>(null);
  const [loadingTab, setLoadingTab] = useState(true);
  const [app, setApp] = useState<AppStatus>("checking");
  const [queue, setQueue] = useState<QueueState | null>(null);
  const [action, setAction] = useState<Action>("idle");
  const [pasted, setPasted] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [thumbBroken, setThumbBroken] = useState(false);

  // Vídeo da aba atual
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url;
      const ref = url ? parseMediaUrl(url) : null;
      setTabVideoId(ref ? mediaKey(ref) : null);
      setLoadingTab(false);
    });
  }, []);

  // Estado do app e fila. Saber disso de antemão evita o popup só descobrir
  // que o app está fechado depois de tentar enviar.
  const refresh = useCallback(async () => {
    const result = await ask<QueueState>({ type: "GET_QUEUE" });
    if (result.ok && result.data) {
      setApp("online");
      setQueue(result.data);
    } else {
      setApp("offline");
      setQueue(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const send = async (videoId: string, kind: "play" | "queue") => {
    setAction("sending");

    const message =
      kind === "play"
        ? { type: "PLAY_NOW", videoId }
        : { type: "ADD_TO_QUEUE", videoIds: [videoId] };

    let result = await ask(message);

    // App fechado: abrir pelo protocolo e esperar ele subir de verdade antes
    // de dizer que deu certo.
    if (!result.ok && result.error === strings.api.appClosed) {
      setAction("launching");
      window.open(`ytview://play?v=${videoId}`);

      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        const health = await ask<boolean>({ type: "CHECK_HEALTH" });
        if (health.ok) {
          result = kind === "play" ? { ok: true } : await ask(message);
          break;
        }
      }
    }

    if (result.ok) {
      setApp("online");
      setAction("done");
      void refresh();
      setTimeout(() => window.close(), 900);
    } else {
      setApp("offline");
      setAction("failed");
    }
  };

  const handlePaste = (kind: "play" | "queue") => {
    const ref = parseMediaUrl(pasted.trim());
    const videoId = ref ? mediaKey(ref) : null;
    if (!videoId) {
      setPasteError(strings.popup.pasteInvalid);
      return;
    }
    setPasteError(null);
    void send(videoId, kind);
  };

  const openQueueWindow = () => {
    // O app abre a janela da fila ao receber o protocolo com a rota.
    window.open("ytview://queue");
    setTimeout(() => window.close(), 400);
  };

  const busy = action === "sending" || action === "launching" || action === "done";
  const videoId = tabVideoId;
  const remaining =
    queue && queue.currentIndex >= 0
      ? queue.items.length - queue.currentIndex - 1
      : queue?.items.length ?? 0;
  const nowPlaying =
    queue && queue.currentIndex >= 0 ? queue.items[queue.currentIndex] : null;

  const actionLabel =
    action === "sending"
      ? strings.popup.sending
      : action === "launching"
      ? strings.popup.launching
      : action === "done"
      ? strings.popup.playing
      : action === "failed"
      ? strings.popup.retry
      : strings.popup.play;

  return (
    <div className="popup">
      <header className="popup-header">
        <h1 className="popup-title">{strings.popup.title}</h1>
        <span className={`popup-status popup-status-${app}`}>
          <i aria-hidden="true" />
          {app === "online"
            ? strings.popup.appOpen
            : app === "offline"
            ? strings.popup.appClosed
            : "..."}
        </span>
      </header>

      {loadingTab ? (
        <p className="popup-loading">{strings.popup.detecting}</p>
      ) : videoId ? (
        <div className="popup-video">
          {(() => {
            // Vimeo e Twitch não dão miniatura sem API: mostramos o serviço.
            const ref = parseMediaKey(videoId);
            const thumb = mediaThumbnail(ref);
            if (!thumb || thumbBroken) {
              return (
                <div className="popup-thumbnail popup-thumbnail-fallback">
                  {providerLabel(ref.provider)}
                </div>
              );
            }
            return (
              <img
                src={thumb}
                alt={strings.popup.thumbnailAlt}
                className="popup-thumbnail"
                onError={() => setThumbBroken(true)}
              />
            );
          })()}
          <div className="popup-actions">
            <button
              type="button"
              className={`popup-button primary ${action !== "idle" ? `is-${action}` : ""}`}
              onClick={() => void send(videoId, "play")}
              disabled={busy}
            >
              {actionLabel}
            </button>
            <button
              type="button"
              className="popup-button"
              onClick={() => void send(videoId, "queue")}
              disabled={busy}
            >
              {strings.popup.addToQueue}
            </button>
          </div>
        </div>
      ) : (
        <div className="popup-paste">
          <p className="popup-empty-title">{strings.popup.noVideoTitle}</p>
          <label className="popup-label" htmlFor="ytview-url">
            {strings.popup.pasteLabel}
          </label>
          <input
            id="ytview-url"
            className={`popup-input ${pasteError ? "has-error" : ""}`}
            type="text"
            placeholder={strings.popup.pastePlaceholder}
            value={pasted}
            onChange={(e) => {
              setPasted(e.target.value);
              setPasteError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handlePaste("play");
            }}
            autoFocus
          />
          {pasteError && <p className="popup-error">{pasteError}</p>}
          <div className="popup-actions">
            <button
              type="button"
              className="popup-button primary"
              onClick={() => handlePaste("play")}
              disabled={busy}
            >
              {strings.popup.play}
            </button>
            <button
              type="button"
              className="popup-button"
              onClick={() => handlePaste("queue")}
              disabled={busy}
            >
              {strings.popup.addToQueue}
            </button>
          </div>
        </div>
      )}

      <footer className="popup-footer">
        {app === "online" && queue ? (
          <>
            {nowPlaying && (
              <p className="popup-now" title={nowPlaying.title || nowPlaying.videoId}>
                <span>{strings.popup.nowPlaying}</span> {nowPlaying.title || nowPlaying.videoId}
              </p>
            )}
            <div className="popup-queue-row">
              <span className="popup-queue-count">
                {queue.items.length === 0
                  ? strings.popup.queueEmpty
                  : strings.popup.queueCount(queue.items.length, remaining)}
              </span>
              <button type="button" className="popup-link" onClick={openQueueWindow}>
                {strings.popup.openQueue}
              </button>
            </div>
          </>
        ) : app === "offline" ? (
          <div className="popup-queue-row">
            <span className="popup-queue-count">{strings.popup.failed}</span>
            <a className="popup-link" href={RELEASES_URL} target="_blank" rel="noreferrer">
              {strings.popup.download}
            </a>
          </div>
        ) : null}
      </footer>
    </div>
  );
}
