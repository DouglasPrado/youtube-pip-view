import type { QueueItem, QueueState } from '../types/index';

/**
 * Regras da fila, sem Electron nem disco no meio — o índice do que está
 * tocando é fácil de dessincronizar, e é aqui que ele se mantém honesto.
 */

function clone(state: QueueState): QueueState {
  return { items: [...state.items], currentIndex: state.currentIndex };
}

function indexOfId(items: QueueItem[], id: string): number {
  return items.findIndex((item) => item.id === id);
}

/**
 * Move um item de posição, mantendo o índice apontando para o mesmo vídeo.
 */
export function reorderQueue(
  state: QueueState,
  fromIndex: number,
  toIndex: number
): QueueState {
  const total = state.items.length;
  if (
    fromIndex < 0 || fromIndex >= total ||
    toIndex < 0 || toIndex >= total ||
    fromIndex === toIndex
  ) {
    return state;
  }

  const next = clone(state);
  const playingId =
    next.currentIndex >= 0 ? next.items[next.currentIndex]?.id : null;

  const [moved] = next.items.splice(fromIndex, 1);
  next.items.splice(toIndex, 0, moved);

  if (playingId) {
    next.currentIndex = indexOfId(next.items, playingId);
  }

  return next;
}

/**
 * Coloca um item logo depois do que está tocando ("tocar em seguida").
 */
export function moveItemAfterCurrent(state: QueueState, id: string): QueueState {
  const fromIndex = indexOfId(state.items, id);
  if (fromIndex === -1) return state;

  const target = state.currentIndex >= 0 ? state.currentIndex + 1 : 0;
  if (fromIndex === target) return state;

  const next = clone(state);
  const playingId =
    next.currentIndex >= 0 ? next.items[next.currentIndex]?.id : null;

  const [moved] = next.items.splice(fromIndex, 1);
  next.items.splice(target > fromIndex ? target - 1 : target, 0, moved);

  if (playingId) {
    next.currentIndex = indexOfId(next.items, playingId);
  }

  return next;
}

/**
 * Remove um item. Tirar da fila o que está tocando não pode parar a fila:
 * o índice segue para quem assumiu a posição.
 */
export function removeFromQueue(
  state: QueueState,
  id: string
): { state: QueueState; playVideoId: string | null } {
  const removedIndex = indexOfId(state.items, id);
  if (removedIndex === -1) return { state, playVideoId: null };

  const wasPlaying = removedIndex === state.currentIndex;
  const next = clone(state);
  next.items.splice(removedIndex, 1);

  if (next.currentIndex >= 0) {
    if (removedIndex < next.currentIndex) {
      next.currentIndex--;
    } else if (wasPlaying) {
      next.currentIndex =
        removedIndex < next.items.length ? removedIndex : -1;
    }
  }

  const playVideoId =
    wasPlaying && next.currentIndex >= 0
      ? next.items[next.currentIndex].videoId
      : null;

  return { state: next, playVideoId };
}

/**
 * Aponta a fila para o vídeo que passou a tocar. Se ele já está na fila,
 * só move o índice; se não, entra logo depois do atual — nunca duplica e
 * nunca vai parar no fim de uma fila longa.
 */
export function withNowPlaying(
  state: QueueState,
  item: QueueItem
): QueueState {
  const existingIndex = state.items.findIndex(
    (existing) => existing.videoId === item.videoId
  );

  const next = clone(state);

  if (existingIndex !== -1) {
    next.currentIndex = existingIndex;
    return next;
  }

  const insertAt =
    next.currentIndex >= 0 && next.currentIndex < next.items.length
      ? next.currentIndex + 1
      : next.items.length;

  next.items.splice(insertAt, 0, item);
  next.currentIndex = insertAt;
  return next;
}

/**
 * Decide o próximo vídeo quando o atual termina.
 *
 * `endedVideoId` é preferido ao índice guardado: os dois podem estar
 * dessincronizados se a fila mudou durante a reprodução.
 */
export function advanceAfterEnded(
  state: QueueState,
  endedVideoId?: string
): { state: QueueState; playVideoId: string | null; endedIndex: number } {
  if (state.items.length === 0) {
    return { state, playVideoId: null, endedIndex: -1 };
  }

  let endedIndex = state.currentIndex;

  if (endedVideoId) {
    const pointsToEnded = state.items[endedIndex]?.videoId === endedVideoId;
    if (!pointsToEnded) {
      endedIndex = state.items.findIndex(
        (item) => item.videoId === endedVideoId
      );
    }
  }

  if (endedIndex < 0 || endedIndex >= state.items.length) {
    return { state, playVideoId: null, endedIndex: -1 };
  }

  const next = clone(state);
  const nextIndex = endedIndex + 1;

  if (nextIndex < next.items.length) {
    next.currentIndex = nextIndex;
    return {
      state: next,
      playVideoId: next.items[nextIndex].videoId,
      endedIndex,
    };
  }

  // Fim da fila
  next.currentIndex = -1;
  return { state: next, playVideoId: null, endedIndex };
}
