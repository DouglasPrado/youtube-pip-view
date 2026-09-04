import { extractVideoId, extractVideoRef } from "@ytview/youtube-utils";
import type { VideoRef } from "@ytview/youtube-utils";

export function useVideoId(): (input: string) => string | null {
  return extractVideoId;
}

/**
 * Igual ao useVideoId, mas devolve também o instante em que o link pede para
 * começar (`&t=90s`).
 */
export function useVideoRef(): (input: string) => VideoRef | null {
  return extractVideoRef;
}
