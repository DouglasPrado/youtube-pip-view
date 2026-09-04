/**
 * Service worker da extensão.
 *
 * Todo acesso à API local passa por aqui de propósito: requisições feitas
 * daqui carregam a origem chrome-extension://, que é o que o app aceita para
 * escrever na fila. Um content script falaria com a origem do youtube.com, e
 * aí qualquer página poderia fazer o mesmo.
 *
 * Também é daqui que saem o selo no ícone, o menu de contexto e os atalhos.
 */

import { mediaKey, parseMediaUrl } from "@ytview/youtube-utils";
import { addToQueue, getQueue, isAppRunning, playNow } from "../api";
import type { ApiResult } from "../api";
import { strings } from "../strings";

type Message =
  | { type: "ADD_TO_QUEUE"; videoIds: string[] }
  | { type: "PLAY_NOW"; videoId: string }
  | { type: "CHECK_HEALTH" }
  | { type: "GET_QUEUE" };

// ===== Selo no ícone =====

const BADGE_ONLINE = "#1b5e20";
const BADGE_OFFLINE = "#5f6368";

/**
 * Diz de relance se o app está aberto e quantos vídeos esperam na fila —
 * antes era preciso abrir o popup e tentar para descobrir.
 */
async function refreshBadge(): Promise<void> {
  const queue = await getQueue();

  if (!queue.ok || !queue.data) {
    await chrome.action.setBadgeText({ text: "" });
    await chrome.action.setTitle({ title: strings.badge.appClosed });
    return;
  }

  const { items, currentIndex } = queue.data;
  const restantes =
    currentIndex >= 0 ? items.length - currentIndex - 1 : items.length;

  await chrome.action.setBadgeBackgroundColor({ color: BADGE_ONLINE });
  await chrome.action.setBadgeText({ text: restantes > 0 ? String(restantes) : "" });
  await chrome.action.setTitle({
    title: restantes > 0 ? strings.badge.queued(restantes) : strings.badge.appOpen,
  });
}

// A cada minuto, e sempre que algo muda por aqui.
chrome.runtime.onInstalled.addListener(() => {
  void chrome.action.setBadgeBackgroundColor({ color: BADGE_OFFLINE });
  createContextMenus();
  void refreshBadge();
  chrome.alarms.create("ytview-badge", { periodInMinutes: 1 });
});

chrome.runtime.onStartup?.addListener(() => {
  createContextMenus();
  void refreshBadge();
});

chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === "ytview-badge") void refreshBadge();
});

// ===== Menu de contexto =====

const MENU_SITES = [
  "*://*.youtube.com/*",
  "*://youtu.be/*",
  "*://*.vimeo.com/*",
  "*://*.twitch.tv/*",
  "*://*.dailymotion.com/*",
  "*://dai.ly/*",
];

const MENU_PLAY = "ytview-play";
const MENU_QUEUE = "ytview-queue";

function createContextMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_PLAY,
      title: strings.menu.playNow,
      contexts: ["link", "video"],
      targetUrlPatterns: MENU_SITES,
    });
    chrome.contextMenus.create({
      id: MENU_QUEUE,
      title: strings.menu.addToQueue,
      contexts: ["link", "video"],
      targetUrlPatterns: MENU_SITES,
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.linkUrl || info.srcUrl || info.pageUrl || tab?.url;
  const ref = url ? parseMediaUrl(url) : null;
  const videoId = ref ? mediaKey(ref) : null;
  if (!videoId) {
    await notifyTab(tab?.id, strings.content.noVideoInLink, "error");
    return;
  }

  const result =
    info.menuItemId === MENU_PLAY
      ? await playNow(videoId)
      : await addToQueue([videoId]);

  await notifyTab(
    tab?.id,
    result.ok
      ? info.menuItemId === MENU_PLAY
        ? strings.content.playing
        : strings.content.addedOne
      : describe(result),
    result.ok ? "success" : "error"
  );
  void refreshBadge();
});

// ===== Atalhos de teclado =====

chrome.commands?.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const ref = tab?.url ? parseMediaUrl(tab.url) : null;
  const videoId = ref ? mediaKey(ref) : null;

  if (!videoId) {
    await notifyTab(tab?.id, strings.content.noVideoHere, "error");
    return;
  }

  const result =
    command === "play-in-ytview"
      ? await playNow(videoId)
      : await addToQueue([videoId]);

  await notifyTab(
    tab?.id,
    result.ok
      ? command === "play-in-ytview"
        ? strings.content.playing
        : strings.content.addedOne
      : describe(result),
    result.ok ? "success" : "error"
  );
  void refreshBadge();
});

// ===== Ponte para o content script e o popup =====

function describe(result: ApiResult<unknown>): string {
  return result.error === "O YTView não está aberto"
    ? strings.content.openAppFirst
    : result.error ?? strings.content.genericFailure;
}

/** Mostra um aviso na página, quando há uma página para avisar. */
async function notifyTab(
  tabId: number | undefined,
  text: string,
  tone: "success" | "error"
): Promise<void> {
  if (!tabId) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: "TOAST", text, tone });
  } catch {
    // Página sem o content script (fora do YouTube): nada a fazer.
  }
}

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case "CHECK_HEALTH":
        return { ok: await isAppRunning() };
      case "GET_QUEUE":
        return getQueue();
      case "PLAY_NOW": {
        const result = await playNow(message.videoId);
        void refreshBadge();
        return result;
      }
      case "ADD_TO_QUEUE": {
        if (!message.videoIds?.length) {
          return { ok: false, error: strings.api.noVideos };
        }
        const result = await addToQueue(message.videoIds);
        void refreshBadge();
        return result;
      }
      default:
        return { ok: false, error: strings.api.unknownRequest };
    }
  })().then(sendResponse);

  return true; // resposta assíncrona
});
