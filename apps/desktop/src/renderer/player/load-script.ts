/**
 * Carrega o SDK de um serviço uma vez só.
 *
 * Cada player (YouTube, Vimeo, Twitch) traz seu próprio script; sem este
 * controle, trocar de vídeo entre serviços carregaria o mesmo arquivo de novo
 * a cada troca.
 */
const loading = new Map<string, Promise<void>>();

export function loadScript(
  url: string,
  isReady: () => boolean
): Promise<void> {
  if (isReady()) return Promise.resolve();

  const existing = loading.get(url);
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;

    script.onload = () => {
      // Alguns SDKs publicam o objeto global um tique depois do onload.
      if (isReady()) {
        resolve();
        return;
      }
      let tries = 0;
      const timer = setInterval(() => {
        if (isReady()) {
          clearInterval(timer);
          resolve();
        } else if (++tries > 50) {
          clearInterval(timer);
          reject(new Error(`SDK não ficou pronto: ${url}`));
        }
      }, 100);
    };

    script.onerror = () => {
      loading.delete(url);
      reject(new Error(`Não foi possível carregar ${url}`));
    };

    document.head.appendChild(script);
  });

  loading.set(url, promise);
  return promise;
}
