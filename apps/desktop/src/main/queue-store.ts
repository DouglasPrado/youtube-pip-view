import { BrowserWindow } from 'electron';
import Store from 'electron-store';
import * as crypto from 'crypto';
import type { QueueItem, QueueState } from '../types/index';
import { withNowPlaying } from './queue-logic';
import {
  mediaPageUrl,
  parseMediaKey,
  providerLabel,
} from '@ytview/youtube-utils';
import type { MediaRef } from '@ytview/youtube-utils';

let store: Store | null = null;
let getWindows: (() => { main: BrowserWindow | null; queue: BrowserWindow | null }) | null = null;

/**
 * Descobre o título pelo oEmbed público do serviço.
 *
 * Vimeo e Dailymotion têm oEmbed aberto, como o YouTube. O Twitch não tem
 * nada equivalente sem chave de API, então lá o nome do canal ou do vídeo é
 * o melhor que dá para mostrar sem pedir credencial a ninguém.
 */
function oembedEndpoints(ref: MediaRef): string[] {
  const page = encodeURIComponent(mediaPageUrl(ref));

  switch (ref.provider) {
    case 'youtube':
      return [
        `https://www.youtube.com/oembed?url=${page}&format=json`,
        `https://noembed.com/embed?url=${page}`,
      ];
    case 'vimeo':
      return [
        `https://vimeo.com/api/oembed.json?url=${page}`,
        `https://noembed.com/embed?url=${page}`,
      ];
    case 'dailymotion':
      return [
        `https://www.dailymotion.com/services/oembed?url=${page}&format=json`,
        `https://noembed.com/embed?url=${page}`,
      ];
    case 'twitch':
      return [];
  }
}

async function fetchMediaTitle(ref: MediaRef): Promise<string | null> {
  const fetchFn = globalThis.fetch;
  if (!fetchFn) return null;

  for (const endpoint of oembedEndpoints(ref)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
      const response = await fetchFn(endpoint, {
        signal: controller.signal,
        headers: { 'User-Agent': 'YTView/1.0' },
      });
      if (!response.ok) continue;

      const data = await response.json() as { title?: unknown };
      if (typeof data.title === 'string' && data.title.trim()) {
        return data.title.trim();
      }
    } catch {
      // Ignore and try next endpoint
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

/** Nome legível quando não há oEmbed (Twitch) ou a busca falhou. */
function fallbackTitle(ref: MediaRef): string {
  if (ref.provider === 'twitch') {
    if (ref.kind === 'channel') return `${ref.id} (Twitch, ao vivo)`;
    if (ref.kind === 'clip') return `Clipe do Twitch`;
    return `Vídeo do Twitch ${ref.id}`;
  }
  return `${providerLabel(ref.provider)} ${ref.id}`;
}

async function resolveQueueItemTitle(item: { videoId: string; title?: string }): Promise<string> {
  const providedTitle = item.title?.trim();
  if (providedTitle) return providedTitle;

  const ref = parseMediaKey(item.videoId);
  const fetchedTitle = await fetchMediaTitle(ref);
  return fetchedTitle ?? fallbackTitle(ref);
}

export function initQueueStore(
  electronStore: Store,
  windowsGetter: () => { main: BrowserWindow | null; queue: BrowserWindow | null }
): void {
  store = electronStore;
  getWindows = windowsGetter;
}

export function getQueue(): QueueState {
  return (store!.get('queue') as QueueState) || { items: [], currentIndex: -1 };
}

export function saveQueue(state: QueueState): void {
  store!.set('queue', state);
}

export function broadcastQueueUpdate(state: QueueState): void {
  if (!getWindows) return;
  const { main, queue } = getWindows();
  if (queue && !queue.isDestroyed()) {
    queue.webContents.send('queue-updated', state);
  }
  if (main && !main.isDestroyed()) {
    main.webContents.send('queue-updated', state);
  }
}

export async function addItemsToQueue(items: Array<{ videoId: string; url: string; title?: string }>): Promise<QueueState> {
  const queue = getQueue();
  const resolvedItems = await Promise.all(
    items.map(async (item) => ({
      ...item,
      title: await resolveQueueItemTitle(item),
    }))
  );

  const newItems: QueueItem[] = resolvedItems.map((item) => ({
    id: `${item.videoId}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    videoId: item.videoId,
    url: item.url,
    title: item.title,
  }));
  queue.items.push(...newItems);
  saveQueue(queue);
  broadcastQueueUpdate(queue);
  return queue;
}

export async function hydrateQueueTitles(): Promise<QueueState> {
  const queue = getQueue();
  if (queue.items.length === 0) return queue;

  let changed = false;
  const hydratedItems = await Promise.all(
    queue.items.map(async (item) => {
      const currentTitle = item.title?.trim();
      const needsHydration =
        !currentTitle ||
        currentTitle === item.videoId ||
        currentTitle === fallbackTitle(parseMediaKey(item.videoId));
      if (!needsHydration) return item;

      const resolvedTitle = await resolveQueueItemTitle({ videoId: item.videoId, title: item.title });
      if (resolvedTitle !== item.title) changed = true;
      return {
        ...item,
        title: resolvedTitle,
      };
    })
  );

  if (changed) {
    queue.items = hydratedItems;
    saveQueue(queue);
    broadcastQueueUpdate(queue);
  }

  return queue;
}

/**
 * As escritas de "agora tocando" são serializadas.
 *
 * Sem isto, duas chamadas para o mesmo vídeo (uma do processo principal ao
 * receber /api/play, outra do renderer ao carregar o vídeo) liam a fila antes
 * de qualquer uma gravar, e cada uma inseria sobre o estado antigo: o vídeo
 * aparecia duas vezes e o índice apontava para o item errado.
 */
let nowPlayingQueue: Promise<unknown> = Promise.resolve();

/**
 * Aponta a fila para o vídeo que está tocando agora.
 *
 * Se o vídeo já está na fila, só move o índice - nada de duplicar. Se não
 * está, entra logo depois do atual, para não ir parar no fim de uma fila
 * longa. Todo caminho que toca um vídeo (campo do app, extensão, ytview://)
 * passa por aqui, senão a fila para de avançar sozinha.
 */
export function setNowPlaying(
  videoId: string,
  options: { url?: string; title?: string } = {}
): Promise<QueueState> {
  const next = nowPlayingQueue.then(() => applyNowPlaying(videoId, options));
  // A cadeia não pode quebrar se uma chamada falhar.
  nowPlayingQueue = next.catch(() => undefined);
  return next;
}

async function applyNowPlaying(
  videoId: string,
  options: { url?: string; title?: string }
): Promise<QueueState> {
  const queue = getQueue();
  const alreadyThere = queue.items.some((item) => item.videoId === videoId);

  const item: QueueItem = {
    id: `${videoId}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    videoId,
    url: options.url ?? mediaPageUrl(parseMediaKey(videoId)),
    // Só busca o título quando o item é novo: para um que já está na fila,
    // a chamada de rede seria desperdício.
    title: alreadyThere
      ? videoId
      : await resolveQueueItemTitle({ videoId, title: options.title }),
  };

  const updated = withNowPlaying(queue, item);
  saveQueue(updated);
  broadcastQueueUpdate(updated);
  return updated;
}

export function playVideoNow(videoId: string): QueueState {
  // A resolução do título é assíncrona e não deve atrasar o play.
  void setNowPlaying(videoId);

  if (getWindows) {
    const { main } = getWindows();
    if (main && !main.isDestroyed()) {
      main.webContents.send('play-video', videoId);
      if (main.getOpacity() < 1) main.setOpacity(1);
      main.show();
      main.focus();
    }
  }

  return getQueue();
}
