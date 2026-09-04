import { useEffect, useRef, useState } from "react";
import { CornerDownRight, GripVertical, Play, RotateCcw, Trash2, X } from "lucide-react";
import {
  mediaKey,
  mediaPageUrl,
  mediaThumbnail,
  parseMediaKey,
  parseMediaUrl,
  providerLabel,
} from "@ytview/youtube-utils";
import type { QueueItem, QueueState } from "../../types";
import { strings } from "../strings";
import "../styles/queue.css";

/** Miniatura quando o serviço oferece uma; senão, a inicial do serviço. */
function Thumb({ videoId }: { videoId: string }) {
  const ref = parseMediaKey(videoId);
  const src = mediaThumbnail(ref);
  const [broken, setBroken] = useState(false);

  if (!src || broken) {
    return (
      <span className={`queue-item-thumb queue-item-thumb-${ref.provider}`} aria-hidden="true">
        {providerLabel(ref.provider).slice(0, 1)}
      </span>
    );
  }

  return (
    <img
      className="queue-item-thumb"
      src={src}
      alt=""
      onError={() => setBroken(true)}
    />
  );
}

export function QueueApp() {
  const [queue, setQueue] = useState<QueueState>({ items: [], currentIndex: -1 });
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [clearedCount, setClearedCount] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeItemRef = useRef<HTMLLIElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    window.electronAPI?.getQueue?.().then((state) => {
      if (state) setQueue(state);
    });
  }, []);

  useEffect(() => {
    return window.electronAPI?.onQueueUpdated?.((state: QueueState) => {
      setQueue(state);
    });
  }, []);

  // Quando a fila avança sozinha, o item que passou a tocar pode estar fora
  // da tela numa lista longa.
  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [queue.currentIndex]);

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    };
  }, []);

  const handleAddVideos = async () => {
    const text = inputValue.trim();
    if (!text) {
      setError(strings.queue.needLinks);
      return;
    }

    const lines = text.split(/[\n,]+/).map((l) => l.trim()).filter(Boolean);
    const parsedItems: Array<{ videoId: string; url: string }> = [];
    const invalidLines: string[] = [];

    for (const line of lines) {
      const ref = parseMediaUrl(line);
      if (ref) {
        parsedItems.push({ videoId: mediaKey(ref), url: mediaPageUrl(ref) });
      } else {
        invalidLines.push(line);
      }
    }

    if (parsedItems.length === 0) {
      setError(strings.queue.noValidLinks);
      return;
    }

    setError(null);
    setIsAdding(true);
    try {
      if (window.electronAPI?.addToQueue) {
        await window.electronAPI.addToQueue(parsedItems);
        setInputValue("");
      } else if (window.electronAPI?.setQueue) {
        const fallbackItems: QueueItem[] = parsedItems.map((item) => ({
          id: `${item.videoId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          videoId: item.videoId,
          url: item.url,
          title: item.videoId,
        }));
        await window.electronAPI.setQueue([...queue.items, ...fallbackItems]);
        setInputValue("");
      }
    } finally {
      setIsAdding(false);
    }

    if (invalidLines.length > 0) {
      setError(strings.queue.partial(parsedItems.length, invalidLines.length));
    }
  };

  const handleRemove = (id: string) => {
    window.electronAPI?.removeFromQueue?.(id);
  };

  // Limpar a fila é destrutivo e irreversível. Em vez de um diálogo de
  // confirmação (que atrapalha quem quis mesmo limpar), a fila fica
  // recuperável por alguns segundos.
  const handleClear = async () => {
    if (!window.electronAPI?.clearQueue) return;

    const removed = queue.items.length;
    const canUndo = await window.electronAPI.clearQueue();
    if (!canUndo) return;

    setClearedCount(removed);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    undoTimeoutRef.current = setTimeout(() => setClearedCount(null), 10000);
  };

  const handleUndoClear = async () => {
    if (!window.electronAPI?.undoClearQueue) return;

    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setClearedCount(null);

    const restored = await window.electronAPI.undoClearQueue();
    if (restored) setQueue(restored);
  };

  const handlePlay = (index: number) => {
    window.electronAPI?.playFromQueue?.(index);
  };

  const handlePlayNext = (id: string) => {
    window.electronAPI?.playNextInQueue?.(id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleAddVideos();
    }
  };

  // Reordenar arrastando: o que qualquer pessoa tenta primeiro numa fila.
  const handleDrop = (targetIndex: number) => {
    if (dragIndex !== null && dragIndex !== targetIndex) {
      window.electronAPI?.reorderQueue?.(dragIndex, targetIndex);
    }
    setDragIndex(null);
    setDropIndex(null);
  };

  const remaining =
    queue.currentIndex >= 0
      ? queue.items.length - queue.currentIndex - 1
      : queue.items.length;

  return (
    <div className="queue-app">
      <div className="queue-header">
        <h1>{strings.queue.title}</h1>
        <span className="queue-count">
          {queue.items.length === 0
            ? strings.queue.empty
            : queue.currentIndex >= 0
            ? strings.queue.countOf(
                queue.currentIndex + 1,
                queue.items.length,
                remaining
              )
            : strings.queue.countPlain(queue.items.length)}
        </span>
      </div>

      <div className="queue-input-section">
        <textarea
          ref={textareaRef}
          className="queue-textarea"
          placeholder={strings.queue.placeholder}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          rows={3}
          aria-label={strings.queue.inputAria}
        />
        {error && <span className="queue-error">{error}</span>}
        <button
          type="button"
          className="queue-add-button"
          onClick={handleAddVideos}
          disabled={isAdding}
        >
          {isAdding ? strings.queue.adding : strings.queue.add}
        </button>
      </div>

      {clearedCount !== null && (
        <div className="queue-undo-bar" role="status">
          <span>
            {strings.queue.cleared(clearedCount)}
          </span>
          <button type="button" className="queue-undo-button" onClick={handleUndoClear}>
            <RotateCcw size={13} aria-hidden="true" />
            {strings.queue.undo}
          </button>
        </div>
      )}

      {queue.items.length === 0 ? (
        <div className="queue-empty">
          <p>{strings.queue.emptyTitle}</p>
          <p className="queue-empty-hint">{strings.queue.emptyHint}</p>
        </div>
      ) : (
        <ul className="queue-list">
          {queue.items.map((item, index) => {
            const isActive = index === queue.currentIndex;
            return (
              <li
                key={item.id}
                ref={isActive ? activeItemRef : undefined}
                className={`queue-item ${isActive ? "active" : ""} ${
                  dropIndex === index ? "drop-target" : ""
                } ${dragIndex === index ? "dragging" : ""}`}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropIndex(index);
                }}
                onDragLeave={() => setDropIndex((current) => (current === index ? null : current))}
                onDrop={() => handleDrop(index)}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDropIndex(null);
                }}
                onDoubleClick={() => handlePlay(index)}
              >
                <span className="queue-item-grip" aria-hidden="true">
                  <GripVertical size={14} />
                </span>
                <span className="queue-item-index">{index + 1}</span>
                <Thumb videoId={item.videoId} />
                <div className="queue-item-info">
                  <span className="queue-item-title" title={item.title || item.videoId}>
                    {item.title || item.videoId}
                  </span>
                  <span className="queue-item-url" title={item.url}>
                    {isActive
                      ? strings.queue.nowPlaying
                      : providerLabel(parseMediaKey(item.videoId).provider)}
                  </span>
                </div>
                <div className="queue-item-actions">
                  <button
                    type="button"
                    className="queue-item-button"
                    onClick={() => handlePlay(index)}
                    title={strings.queue.playNow}
                    aria-label={`Tocar ${item.title || item.videoId}`}
                  >
                    <Play size={13} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="queue-item-button"
                    onClick={() => handlePlayNext(item.id)}
                    title={strings.queue.playNext}
                    aria-label={`Tocar ${item.title || item.videoId} em seguida`}
                    disabled={isActive}
                  >
                    <CornerDownRight size={13} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="queue-item-button remove"
                    onClick={() => handleRemove(item.id)}
                    title={strings.queue.remove}
                    aria-label={`Remover ${item.title || item.videoId}`}
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {queue.items.length > 0 && (
        <div className="queue-footer">
          <button type="button" className="queue-clear-button" onClick={handleClear}>
            <Trash2 size={13} aria-hidden="true" />
            {strings.queue.clear}
          </button>
          {queue.currentIndex === -1 && (
            <button
              type="button"
              className="queue-play-all-button"
              onClick={() => handlePlay(0)}
            >
              <Play size={13} aria-hidden="true" />
              {strings.queue.playAll}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
