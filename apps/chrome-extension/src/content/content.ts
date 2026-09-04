// Content script injetado nas páginas do YouTube.
//
// Não fala com a API local direto: manda mensagem ao service worker, que tem
// a origem chrome-extension:// aceita pelo app. Ver service-worker.ts.
import { mediaKey, parseMediaUrl } from "@ytview/youtube-utils";
import { strings } from "../strings";
import "./content.css";

const PLAYLIST_BTN_ID = "ytview-add-all";
const TOAST_ID = "ytview-toast";
const OVERLAY_ID = "ytview-thumb-actions";

interface ApiResult {
  ok: boolean;
  error?: string;
  data?: { items: Array<{ videoId: string }> };
}

function askBackground(message: Record<string, unknown>): Promise<ApiResult> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response?: ApiResult) => {
      if (chrome.runtime.lastError || !response) {
        resolve({ ok: false, error: strings.api.noResponse });
        return;
      }
      resolve(response);
    });
  });
}

// ===== Aviso na tela =====

let toastTimer: number | null = null;

/**
 * Uma falha precisa dizer o que houve. Antes, o botão só mudava de cor por um
 * segundo e meio e a pessoa não sabia por quê.
 */
function showToast(text: string, tone: "success" | "error" = "success") {
  let toast = document.getElementById(TOAST_ID);
  if (!toast) {
    toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.className = "ytview-toast";
    // Leitores de tela anunciam a mudança sem roubar o foco.
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }

  toast.textContent = text;
  toast.classList.toggle("ytview-toast-error", tone === "error");
  toast.classList.add("ytview-toast-visible");

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast?.classList.remove("ytview-toast-visible");
  }, 3400);
}

// O service worker também pede avisos (menu de contexto e atalhos).
chrome.runtime.onMessage.addListener((message: { type: string; text: string; tone: "success" | "error" }) => {
  if (message?.type === "TOAST") showToast(message.text, message.tone);
});

// ===== O que já está na fila =====

let queuedIds = new Set<string>();

async function refreshQueuedIds(): Promise<void> {
  const result = await askBackground({ type: "GET_QUEUE" });
  if (result.ok && result.data) {
    queuedIds = new Set(result.data.items.map((item) => item.videoId));
    updateOverlayState();
  }
}

// ===== Ações =====

async function sendToApp(
  videoIds: string[],
  action: "play" | "queue"
): Promise<boolean> {
  const result =
    action === "play"
      ? await askBackground({ type: "PLAY_NOW", videoId: videoIds[0] })
      : await askBackground({ type: "ADD_TO_QUEUE", videoIds });

  if (result.ok) {
    videoIds.forEach((id) => queuedIds.add(id));
    updateOverlayState();
    showToast(
      action === "play"
        ? strings.content.playing
        : videoIds.length === 1
        ? strings.content.addedOne
        : strings.content.addedMany(videoIds.length)
    );
    return true;
  }

  showToast(
    result.error === strings.api.appClosed
      ? strings.content.openAppFirst
      : result.error ?? strings.content.genericFailure,
    "error"
  );
  return false;
}

// ===== Botões sobre a miniatura =====

/**
 * Cartões do YouTube, que têm nomes de elemento estáveis.
 *
 * Nos outros sites não dá para fixar seletor: Vimeo e Twitch usam classes
 * geradas no build (css-ob0kw, css-18vh7uv), que mudam sozinhas. Por isso a
 * detecção real é pelo link — ver videoIdFrom/cardFor.
 */
const RENDERERS = [
  "ytd-rich-item-renderer",
  "ytd-video-renderer",
  "ytd-compact-video-renderer",
  "ytd-grid-video-renderer",
  "ytd-playlist-video-renderer",
  "ytd-playlist-panel-video-renderer",
  "ytm-shorts-lockup-view-model",
  "ytd-reel-item-renderer",
].join(", ");

/**
 * A imagem do vídeo dentro do cartão — é sobre ela que os botões se ancoram.
 * O card inclui título e canal; ancorar nele jogaria os botões sobre o texto.
 */
const THUMB_SELECTOR = [
  "ytd-thumbnail",
  "ytd-playlist-thumbnail",
  "a#thumbnail",
  ".ytThumbnailViewModelHost",
  "yt-thumbnail-view-model",
  // Nos demais sites, a própria imagem é a âncora confiável.
  "img",
].join(", ");

let overlay: HTMLDivElement | null = null;
let currentVideoId: string | null = null;
let currentRenderer: Element | null = null;
let hideTimer: number | null = null;
let followFrame = 0;
let pointer = { x: -1, y: -1 };
let resetTimer: number | null = null;

function icon(name: "play" | "plus" | "check"): string {
  const paths = {
    play: '<polygon points="6 4 20 12 6 20 6 4"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

function getOverlay(): HTMLDivElement {
  if (overlay) return overlay;

  const box = document.createElement("div");
  box.id = OVERLAY_ID;
  box.className = "ytview-thumb-actions";

  const play = document.createElement("button");
  play.type = "button";
  play.className = "ytview-thumb-button ytview-play";
  play.innerHTML = icon("play");
  play.title = strings.content.playNow;
  play.setAttribute("aria-label", strings.content.playNow);
  play.addEventListener("click", (e) => handleAction(e, "play"));

  const queue = document.createElement("button");
  queue.type = "button";
  queue.className = "ytview-thumb-button ytview-queue";
  queue.innerHTML = icon("plus");
  queue.title = strings.content.addToQueue;
  queue.setAttribute("aria-label", strings.content.addToQueue);
  queue.addEventListener("click", (e) => handleAction(e, "queue"));

  box.append(play, queue);
  // Quem decide esconder é o loop de acompanhamento (followCard), que olha
  // onde o ponteiro está de fato — mouseleave dispara sozinho quando o
  // YouTube re-renderiza o cartão.
  box.addEventListener("focusin", cancelHide);

  document.body.appendChild(box);
  overlay = box;
  return box;
}

async function handleAction(event: Event, action: "play" | "queue") {
  event.preventDefault();
  event.stopPropagation();

  const button = event.currentTarget as HTMLButtonElement;
  if (!currentVideoId || button.disabled) return;

  // O vídeo do clique, não o que estiver sob o mouse quando a resposta chegar.
  const videoId = currentVideoId;
  button.disabled = true;
  button.classList.add("ytview-busy");

  const done = await sendToApp([videoId], action);

  // Os botões são um par só, reaproveitado em todos os cards: se o mouse já
  // passou para outro vídeo, o retorno visual não é mais dele.
  if (currentVideoId !== videoId) {
    resetButtons();
    return;
  }

  button.classList.remove("ytview-busy");
  button.classList.add(done ? "ytview-done" : "ytview-failed");
  if (done && action === "queue") button.innerHTML = icon("check");

  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = window.setTimeout(() => {
    resetTimer = null;
    resetButtons();
  }, 1400);
}

/** Devolve os botões ao estado neutro do vídeo que está sob o mouse agora. */
function resetButtons(): void {
  if (!overlay) return;

  if (resetTimer) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }

  overlay.querySelectorAll<HTMLButtonElement>(".ytview-thumb-button").forEach(
    (button) => {
      button.disabled = false;
      button.classList.remove("ytview-busy", "ytview-done", "ytview-failed");
    }
  );

  const play = overlay.querySelector<HTMLButtonElement>(".ytview-play");
  if (play) play.innerHTML = icon("play");

  updateOverlayState();
}

/** O "+" vira ✓ quando o vídeo já está na fila. */
function updateOverlayState(): void {
  if (!overlay || !currentVideoId) return;
  const queueButton = overlay.querySelector<HTMLButtonElement>(".ytview-queue");
  if (!queueButton || queueButton.disabled) return;
  // Um resultado ainda na tela não pode ser sobrescrito.
  if (queueButton.classList.contains("ytview-done") ||
      queueButton.classList.contains("ytview-failed")) return;

  const already = queuedIds.has(currentVideoId);
  queueButton.innerHTML = icon(already ? "check" : "plus");
  queueButton.classList.toggle("ytview-already", already);
  const label = already ? strings.content.alreadyQueued : strings.content.addToQueue;
  queueButton.title = label;
  queueButton.setAttribute("aria-label", label);
}

function cancelHide(): void {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function scheduleHide(): void {
  cancelHide();
  hideTimer = window.setTimeout(() => {
    // Com o foco dentro dos botões, esconder tiraria o alvo do teclado.
    if (overlay?.contains(document.activeElement)) return;
    hideOverlay();
  }, 260);
}

function hideOverlay(): void {
  overlay?.classList.remove("ytview-visible");
  currentVideoId = null;
  currentRenderer = null;
  cancelAnimationFrame(followFrame);
  followFrame = 0;
}

/** A área da miniatura dentro do cartão, recalculada a cada quadro. */
function thumbRect(renderer: Element): DOMRect {
  // O YouTube troca a miniatura por um player de pré-visualização quando o
  // mouse para em cima. Guardar a referência do elemento fazia o overlay
  // seguir um nó que já saiu do DOM — e sumir da tela.
  const thumb = renderer.querySelector(THUMB_SELECTOR);
  const rect = (thumb ?? renderer).getBoundingClientRect();
  return rect.width > 0 && rect.height > 0
    ? rect
    : renderer.getBoundingClientRect();
}

function pointerIsOver(rect: DOMRect): boolean {
  if (pointer.x < 0) return true; // sem posição conhecida, não esconder
  return (
    pointer.x >= rect.left &&
    pointer.x <= rect.right &&
    pointer.y >= rect.top &&
    pointer.y <= rect.bottom
  );
}

function positionOverlay(): void {
  if (!currentRenderer || !overlay) return;

  const cardRect = currentRenderer.getBoundingClientRect();
  if (cardRect.bottom < 0 || cardRect.top > window.innerHeight) {
    hideOverlay();
    return;
  }

  const rect = thumbRect(currentRenderer);
  const height = overlay.offsetHeight || 34;

  // Canto inferior esquerdo da imagem: o YouTube usa o direito para a duração.
  overlay.style.left = `${rect.left + 8}px`;
  overlay.style.top = `${Math.min(
    rect.bottom - height - 8,
    window.innerHeight - height - 4
  )}px`;
}

/**
 * Acompanha o cartão enquanto o mouse estiver nele.
 *
 * O layout do YouTube se mexe sozinho no hover (pré-visualização, sombras,
 * expansão do título), então posicionar só uma vez deixava os botões para
 * trás. Sair do cartão e do overlay é o que os esconde — não um mouseleave,
 * que o próprio re-render dispara à toa.
 */
function followCard(): void {
  cancelAnimationFrame(followFrame);
  followFrame = requestAnimationFrame(function passo() {
    if (!currentRenderer || !overlay) return;

    if (!currentRenderer.isConnected) {
      hideOverlay();
      return;
    }

    positionOverlay();

    const noCartao = pointerIsOver(currentRenderer.getBoundingClientRect());
    const noOverlay = pointerIsOver(overlay.getBoundingClientRect());
    const comFoco = overlay.contains(document.activeElement);

    if (!noCartao && !noOverlay && !comFoco) {
      scheduleHide();
    } else {
      cancelHide();
    }

    followFrame = requestAnimationFrame(passo);
  });
}

function showOverlay(renderer: Element, videoId: string): void {
  const box = getOverlay();
  cancelHide();

  const trocouDeVideo = currentVideoId !== videoId;
  currentVideoId = videoId;
  currentRenderer = renderer;

  // Trocar de card zera qualquer ✓ ou ✗ que ainda estivesse na tela.
  if (trocouDeVideo) resetButtons();

  box.classList.add("ytview-visible");
  updateOverlayState();
  positionOverlay();
  followCard();
}

/** O vídeo de um cartão do YouTube, onde o seletor de elemento é estável. */
function videoIdFrom(renderer: Element): string | null {
  const links = renderer.querySelectorAll<HTMLAnchorElement>("a[href]");
  for (const link of links) {
    if (!link.href) continue;
    const ref = parseMediaUrl(link.href);
    if (ref) return mediaKey(ref);
  }
  return null;
}

/**
 * O bloco visual a que o link pertence.
 *
 * Sobe do link até o primeiro ancestral que contenha uma imagem e tenha
 * tamanho de cartão. É o que permite ancorar os botões sobre a miniatura sem
 * depender de nomes de classe — que no Vimeo e no Twitch são gerados no build.
 */
function cardFor(link: HTMLElement): Element {
  let element: HTMLElement | null = link;
  let melhor: HTMLElement = link;

  for (let nivel = 0; nivel < 4 && element; nivel++) {
    const rect = element.getBoundingClientRect();
    if (rect.width >= 120 && rect.height >= 80 && element.querySelector("img")) {
      melhor = element;
      break;
    }
    if (rect.width > melhor.getBoundingClientRect().width) melhor = element;
    element = element.parentElement;
  }

  return melhor;
}

function setupHoverDetection(): void {
  document.addEventListener(
    "mousemove",
    (event) => {
      pointer = { x: event.clientX, y: event.clientY };
    },
    { passive: true }
  );

  document.addEventListener("mouseover", (event) => {
    const target = event.target as HTMLElement;

    // YouTube: o cartão tem nome próprio e é o alvo mais preciso.
    const renderer = target.closest(RENDERERS);
    if (renderer) {
      if (renderer === currentRenderer) return;
      const videoId = videoIdFrom(renderer);
      if (videoId) showOverlay(renderer, videoId);
      return;
    }

    // Demais sites: o que identifica um vídeo é o link em si.
    const link = target.closest<HTMLAnchorElement>("a[href]");
    if (!link) return;

    const ref = parseMediaUrl(link.href);
    if (!ref) return;

    const card = cardFor(link);
    if (card === currentRenderer) return;
    showOverlay(card, mediaKey(ref));
  });

  // Chegar por teclado também revela os botões.
  document.addEventListener("focusin", (event) => {
    const target = event.target as HTMLElement;
    if (overlay?.contains(target)) return;

    const renderer = target.closest(RENDERERS);
    if (renderer) {
      const videoId = videoIdFrom(renderer);
      if (videoId) showOverlay(renderer, videoId);
      return;
    }

    const link = target.closest<HTMLAnchorElement>("a[href]");
    const ref = link ? parseMediaUrl(link.href) : null;
    if (link && ref) showOverlay(cardFor(link), mediaKey(ref));
  });

  // Rolagem e redimensionamento já são acompanhados pelo followCard.
}

// ===== Playlists =====

function isPlaylistPage(): boolean {
  const { pathname, search } = window.location;
  // Vale para a página da playlist e para uma playlist aberta no player.
  return (
    (pathname.startsWith("/playlist") && search.includes("list=")) ||
    (pathname.startsWith("/watch") && search.includes("list="))
  );
}

function collectPlaylistVideoIds(): string[] {
  const selectors = [
    "ytd-playlist-video-renderer a#video-title",
    "ytd-playlist-video-renderer a[href*='/watch?v=']",
    "ytd-playlist-panel-video-renderer a[href*='/watch?v=']",
    "ytd-playlist-video-list-renderer a[href*='/watch?v=']",
  ];

  const ids: string[] = [];
  for (const selector of selectors) {
    document.querySelectorAll<HTMLAnchorElement>(selector).forEach((link) => {
      const ref = parseMediaUrl(link.href);
      const id = ref ? mediaKey(ref) : null;
      if (id && !ids.includes(id)) ids.push(id);
    });
    if (ids.length > 0) break;
  }
  return ids;
}

function playlistButton(): HTMLButtonElement {
  const existing = document.getElementById(PLAYLIST_BTN_ID);
  if (existing) return existing as HTMLButtonElement;

  const button = document.createElement("button");
  button.id = PLAYLIST_BTN_ID;
  button.type = "button";
  button.className = "ytview-playlist-button";
  button.innerHTML = `${icon("plus")}<span></span>`;
  button.addEventListener("click", handlePlaylistClick);
  document.body.appendChild(button);
  return button;
}

async function handlePlaylistClick(event: Event): Promise<void> {
  event.preventDefault();
  const button = event.currentTarget as HTMLButtonElement;
  const label = button.querySelector("span")!;
  const ids = collectPlaylistVideoIds();

  if (ids.length === 0) {
    showToast(strings.content.noPlaylistVideos, "error");
    return;
  }

  button.disabled = true;
  label.textContent = strings.content.adding;

  const done = await sendToApp(ids, "queue");

  label.textContent = done
    ? strings.content.addedCount(ids.length)
    : strings.content.failed;
  button.classList.toggle("ytview-done", done);
  button.classList.toggle("ytview-failed", !done);

  // A playlist carrega por rolagem: o que não foi renderizado não entrou.
  if (done && ids.length >= 100) showToast(strings.content.scrollHint);

  setTimeout(() => {
    button.disabled = false;
    button.classList.remove("ytview-done", "ytview-failed");
    updatePlaylistButtonLabel();
  }, 2400);
}

/** O rótulo diz quantos vídeos serão enviados de fato. */
function updatePlaylistButtonLabel(): void {
  const button = document.getElementById(PLAYLIST_BTN_ID);
  if (!button) return;
  const label = button.querySelector("span");
  if (!label || (button as HTMLButtonElement).disabled) return;

  const count = collectPlaylistVideoIds().length;
  label.textContent = count > 0
    ? strings.content.addAllCount(count)
    : strings.content.addAll;
}

// ===== Init =====

let labelTimer: number | null = null;

function onNavigate(): void {
  hideOverlay();

  if (isPlaylistPage()) {
    playlistButton();
    updatePlaylistButtonLabel();
    // A contagem muda conforme a playlist carrega por rolagem.
    if (labelTimer) clearInterval(labelTimer);
    labelTimer = window.setInterval(updatePlaylistButtonLabel, 1500);
  } else {
    document.getElementById(PLAYLIST_BTN_ID)?.remove();
    if (labelTimer) {
      clearInterval(labelTimer);
      labelTimer = null;
    }
  }

  void refreshQueuedIds();
}

document.addEventListener("yt-navigate-finish", onNavigate);
window.addEventListener("popstate", () => setTimeout(onNavigate, 500));

setupHoverDetection();
onNavigate();
