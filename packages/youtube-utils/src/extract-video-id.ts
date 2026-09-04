/**
 * Um vídeo do YouTube identificado a partir de um texto colado.
 */
export interface VideoRef {
  videoId: string;
  /** Segundo em que o link pede para começar (`&t=90s`). 0 quando não há. */
  startSeconds: number;
}

const VIDEO_ID = "[a-zA-Z0-9_-]{11}";

/**
 * Caminhos que carregam um ID de vídeo. Cobre o que as pessoas realmente
 * colam: watch, youtu.be, embed, shorts, live e o /v/ antigo — em qualquer
 * subdomínio (www, m, music).
 */
const URL_PATTERNS = [
  new RegExp(`[?&]v=(${VIDEO_ID})`),
  new RegExp(`youtu\\.be/(${VIDEO_ID})`),
  new RegExp(`/embed/(${VIDEO_ID})`),
  new RegExp(`/shorts/(${VIDEO_ID})`),
  new RegExp(`/live/(${VIDEO_ID})`),
  new RegExp(`/v/(${VIDEO_ID})`),
];

const DIRECT_ID = new RegExp(`^${VIDEO_ID}$`);

/**
 * Lê o instante inicial de um link: `t=90`, `t=90s`, `t=1m30s`, `t=1h2m3s`
 * ou `start=90`. Devolve 0 quando não há nada legível.
 */
function parseStartSeconds(input: string): number {
  const match = input.match(/[?&#](?:t|start)=([0-9hms]+)/i);
  if (!match) return 0;

  const raw = match[1];

  // Formato simples: só dígitos, com ou sem "s" no fim.
  const plain = raw.match(/^(\d+)s?$/i);
  if (plain) return parseInt(plain[1], 10);

  // Formato composto: 1h2m3s, 90m, 45s...
  const composed = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!composed || !composed.slice(1).some(Boolean)) return 0;

  const [, hours, minutes, seconds] = composed;
  return (
    parseInt(hours || "0", 10) * 3600 +
    parseInt(minutes || "0", 10) * 60 +
    parseInt(seconds || "0", 10)
  );
}

/**
 * Extrai o vídeo e o instante inicial de uma URL do YouTube ou de um ID solto.
 *
 * Formatos aceitos:
 * - ID direto de 11 caracteres
 * - youtube.com/watch?v=ID (com &t=)
 * - youtu.be/ID
 * - youtube.com/embed/ID
 * - youtube.com/shorts/ID
 * - youtube.com/live/ID
 * - youtube.com/v/ID
 * - qualquer subdomínio: www, m, music
 */
export function extractVideoRef(input: string): VideoRef | null {
  if (!input || input.trim() === "") {
    return null;
  }

  const trimmed = input.trim();

  if (DIRECT_ID.test(trimmed)) {
    return { videoId: trimmed, startSeconds: 0 };
  }

  for (const pattern of URL_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return { videoId: match[1], startSeconds: parseStartSeconds(trimmed) };
    }
  }

  return null;
}

/**
 * Igual a extractVideoRef, mas devolve só o ID.
 */
export function extractVideoId(input: string): string | null {
  return extractVideoRef(input)?.videoId ?? null;
}
