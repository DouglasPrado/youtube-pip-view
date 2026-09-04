// YouTube IFrame Player API Types
declare namespace YT {
  interface PlayerState {
    UNSTARTED: -1;
    ENDED: 0;
    PLAYING: 1;
    PAUSED: 2;
    BUFFERING: 3;
    CUED: 5;
  }

  interface PlayerEvent {
    target: Player;
    data: any;
  }

  interface VideoData {
    video_id: string;
    author: string;
    title: string;
  }

  interface PlayerOptions {
    height?: string | number;
    width?: string | number;
    videoId?: string;
    host?: string;
    playerVars?: {
      autoplay?: 0 | 1;
      cc_lang_pref?: string;
      cc_load_policy?: 0 | 1;
      color?: 'red' | 'white';
      controls?: 0 | 1 | 2;
      disablekb?: 0 | 1;
      enablejsapi?: 0 | 1;
      end?: number;
      fs?: 0 | 1;
      hl?: string;
      iv_load_policy?: 1 | 3;
      list?: string;
      listType?: 'playlist' | 'search' | 'user_uploads';
      loop?: 0 | 1;
      modestbranding?: 0 | 1;
      origin?: string;
      playlist?: string;
      playsinline?: 0 | 1;
      rel?: 0 | 1;
      start?: number;
    };
    events?: {
      onReady?: (event: any) => void;
      onStateChange?: (event: any) => void;
      onPlaybackQualityChange?: (event: PlayerEvent) => void;
      onPlaybackRateChange?: (event: PlayerEvent) => void;
      onError?: (event: any) => void;
      onApiChange?: (event: PlayerEvent) => void;
    };
  }

  class Player {
    constructor(containerId: string | HTMLElement, options: PlayerOptions);
    destroy(): void;
    loadVideoById(
      videoId: string | { videoId: string; startSeconds?: number },
      startSeconds?: number
    ): void;
    cueVideoById(videoId: string, startSeconds?: number): void;
    playVideo(): void;
    pauseVideo(): void;
    stopVideo(): void;
    seekTo(seconds: number, allowSeekAhead?: boolean): void;
    getVideoLoadedFraction(): number;
    getPlayerState(): number;
    getCurrentTime(): number;
    getDuration(): number;
    getVideoUrl(): string;
    getVideoEmbedCode(): string;
    getVideoData(): VideoData;
    getAvailablePlaybackRates(): number[];
    setPlaybackRate(suggestedRate: number): void;
    getAvailableQualityLevels(): string[];
    setPlaybackQuality(suggestedQuality: string): void;
    getIframe(): HTMLIFrameElement;
    setVolume(volume: number): void;
    getVolume(): number;
    mute(): void;
    unMute(): void;
    isMuted(): boolean;
    getPlaybackRate(): number;
    loadModule(module: string): void;
    unloadModule(module: string): void;
    setOption(module: string, option: string, value: unknown): void;
    addEventListener(event: string, listener: (event: PlayerEvent) => void): void;
    removeEventListener(event: string, listener: (event: PlayerEvent) => void): void;
  }
}

declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

declare function onYouTubeIframeAPIReady(): void;
