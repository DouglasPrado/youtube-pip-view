/**
 * Conversa com o YTView que roda na máquina.
 *
 * A porta não é fixa: o app prefere a 8765, mas usa a seguinte livre se ela
 * estiver ocupada. Antes disso a extensão só sabia falar na 8765 e dizia "o
 * YTView não está aberto" com o app aberto ao lado.
 */

const FIRST_PORT = 8765;
const PORT_COUNT = 10;
const REMEMBERED_PORT_KEY = "ytviewPort";

export interface QueueItem {
  id: string;
  videoId: string;
  url: string;
  title?: string;
}

export interface QueueState {
  items: QueueItem[];
  currentIndex: number;
}

export interface ApiResult<T = void> {
  ok: boolean;
  data?: T;
  /** Motivo pronto para mostrar a quem está usando. */
  error?: string;
}

function portsToTry(remembered: number | null): number[] {
  const range = Array.from({ length: PORT_COUNT }, (_, i) => FIRST_PORT + i);
  if (remembered && !range.includes(remembered)) return [remembered, ...range];
  if (remembered) return [remembered, ...range.filter((p) => p !== remembered)];
  return range;
}

async function readRememberedPort(): Promise<number | null> {
  try {
    const stored = await chrome.storage.local.get(REMEMBERED_PORT_KEY);
    const port = stored[REMEMBERED_PORT_KEY];
    return typeof port === "number" ? port : null;
  } catch {
    return null;
  }
}

async function rememberPort(port: number): Promise<void> {
  try {
    await chrome.storage.local.set({ [REMEMBERED_PORT_KEY]: port });
  } catch {
    // Sem storage a extensão só perde o atalho da porta; segue varrendo.
  }
}

async function ping(port: number, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://localhost:${port}/api/health`, {
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Descobre em que porta o app está. Tenta primeiro a última que funcionou:
 * no caso comum é uma requisição só.
 */
export async function findAppPort(
  timeoutPerPort = 400
): Promise<number | null> {
  const remembered = await readRememberedPort();

  for (const port of portsToTry(remembered)) {
    if (await ping(port, timeoutPerPort)) {
      if (port !== remembered) await rememberPort(port);
      return port;
    }
  }

  return null;
}

export const APP_CLOSED = "O YTView não está aberto";

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<ApiResult<T>> {
  const port = await findAppPort();
  if (port === null) return { ok: false, error: APP_CLOSED };

  const attempt = async (): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      return await fetch(`http://localhost:${port}${path}`, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let response: Response;
    try {
      response = await attempt();
    } catch {
      // Uma falha isolada (o app acabou de abrir, por exemplo) não deve
      // virar erro na cara de quem clicou.
      await new Promise((resolve) => setTimeout(resolve, 350));
      response = await attempt();
    }

    if (!response.ok) {
      return {
        ok: false,
        error:
          response.status === 403
            ? "O YTView recusou o pedido"
            : `O YTView respondeu com erro ${response.status}`,
      };
    }

    const text = await response.text();
    return { ok: true, data: text ? (JSON.parse(text) as T) : undefined };
  } catch {
    return { ok: false, error: APP_CLOSED };
  }
}

export function playNow(videoId: string): Promise<ApiResult<QueueState>> {
  return request<QueueState>("/api/play", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId }),
  });
}

export function addToQueue(videoIds: string[]): Promise<ApiResult<QueueState>> {
  const items = videoIds.map((videoId) => ({
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
  }));
  return request<QueueState>("/api/queue/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
}

export function getQueue(): Promise<ApiResult<QueueState>> {
  return request<QueueState>("/api/queue");
}

export async function isAppRunning(): Promise<boolean> {
  return (await findAppPort()) !== null;
}
