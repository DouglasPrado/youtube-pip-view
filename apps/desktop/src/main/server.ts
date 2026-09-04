import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { getQueue, addItemsToQueue, playVideoNow } from './queue-store';

let server: http.Server | null = null;
let serverPort: number | null = null;
let extensionApiAvailable = false;
const DEFAULT_PORT = 8765;
/**
 * Se a porta preferida estiver ocupada, tentamos as seguintes em ordem — e a
 * extensão varre esta mesma faixa. Uma porta aleatória deixaria a extensão
 * cega para sempre, dizendo "o YTView não está aberto" com ele aberto.
 */
const PORT_RANGE_SIZE = 10;

// Mapeamento de extensões para MIME types
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

/**
 * Origens que podem falar com a API: só extensões do navegador. Chamadas sem
 * cabeçalho Origin (curl local, o próprio renderer) continuam passando.
 */
function isAllowedOrigin(origin: string): boolean {
  return (
    origin.startsWith('chrome-extension://') ||
    origin.startsWith('moz-extension://') ||
    origin.startsWith('safari-web-extension://')
  );
}

/**
 * Trata uma requisição: rotas /api/* para a extensão, o resto é o bundle do renderer.
 */
function createRequestHandler(distPath: string) {
  return (req: http.IncomingMessage, res: http.ServerResponse) => {
    const urlPath = req.url?.split('?')[0] || '/';

    // API routes
    if (urlPath.startsWith('/api/')) {
      const origin = req.headers.origin;

      // A API só responde para a extensão (origem chrome-extension://) e para
      // chamadas locais sem origem. Com 'Allow-Origin: *' qualquer site aberto
      // no navegador podia enfileirar vídeos e trocar o que estava tocando.
      if (origin) {
        if (isAllowedOrigin(origin)) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Vary', 'Origin');
        } else {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Origin not allowed' }));
          return;
        }
      }

      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (urlPath === '/api/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      if (urlPath === '/api/queue' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(getQueue()));
        return;
      }

      if (urlPath === '/api/play' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const { videoId } = JSON.parse(body);
            if (!videoId || typeof videoId !== 'string') {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'videoId is required' }));
              return;
            }
            const updatedQueue = playVideoNow(videoId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(updatedQueue));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON body' }));
          }
        });
        return;
      }

      if (urlPath === '/api/queue/add' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            const { items } = JSON.parse(body);
            if (!Array.isArray(items) || items.length === 0) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'items array is required' }));
              return;
            }
            const updatedQueue = await addItemsToQueue(items);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(updatedQueue));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON body' }));
          }
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Determinar o caminho do arquivo
    let filePath = path.join(distPath, urlPath === '/' ? 'index.html' : urlPath);

    // Verificar se o arquivo existe
    if (!fs.existsSync(filePath)) {
      // Se não existir, tentar servir index.html (para SPA routing)
      filePath = path.join(distPath, 'index.html');

      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 - Arquivo não encontrado');
        return;
      }
    }

    // Se for um diretório, servir o index.html
    if (fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');

      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 - index.html não encontrado');
        return;
      }
    }

    // Determinar o Content-Type baseado na extensão
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Ler e servir o arquivo
    fs.readFile(filePath, (err, content) => {
      if (err) {
        console.error('[Server] Erro ao ler arquivo:', err);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 - Erro interno do servidor');
        return;
      }

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
      });
      res.end(content);
    });
  };
}

/**
 * Sobe um servidor numa porta. Rejeita com o erro do Node (EADDRINUSE, etc.)
 * em vez de deixar o listener de erro pendurado.
 */
function listen(target: http.Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => {
      target.removeListener('listening', onListening);
      reject(err);
    };

    const onListening = () => {
      target.removeListener('error', onError);
      const address = target.address();
      resolve(typeof address === 'object' && address ? address.port : port);
    };

    target.once('error', onError);
    target.once('listening', onListening);
    target.listen(port, 'localhost');
  });
}

/**
 * Inicia o servidor HTTP local.
 *
 * A porta 8765 é fixa porque a extensão do Chrome só conhece ela. Se estiver
 * ocupada, o app sobe numa porta livre em vez de não abrir: perde-se a
 * comunicação com a extensão, não o app inteiro.
 */
export async function startServer(distPath: string): Promise<void> {
  if (server) {
    console.log('[Server] Servidor já está rodando na porta', serverPort);
    return;
  }

  // Verificar se o diretório dist existe
  if (!fs.existsSync(distPath)) {
    throw new Error(`Diretório dist não encontrado: ${distPath}`);
  }

  const handler = createRequestHandler(distPath);

  server = http.createServer(handler);

  let lastError: unknown = null;

  for (let offset = 0; offset < PORT_RANGE_SIZE; offset++) {
    const port = DEFAULT_PORT + offset;
    try {
      serverPort = await listen(server, port);
      // Fora da porta preferida a extensão ainda encontra (ela varre a faixa),
      // mas avisamos porque o usuário pode querer liberar a 8765.
      extensionApiAvailable = offset === 0;
      if (offset > 0) {
        console.warn(`[Server] Porta ${DEFAULT_PORT} ocupada; usando ${port}.`);
      }
      console.log(`[Server] Servidor HTTP local iniciado em http://localhost:${port}`);
      return;
    } catch (err) {
      lastError = err;
      if ((err as NodeJS.ErrnoException)?.code !== 'EADDRINUSE') break;
      // Uma porta ocupada invalida o servidor: refazer para a próxima tentativa.
      server.close();
      server = http.createServer(handler);
    }
  }

  server?.close();
  server = null;
  serverPort = null;
  throw lastError ?? new Error('Não foi possível abrir uma porta local');
}

/**
 * Para o servidor HTTP local
 */
export function stopServer(): void {
  if (server) {
    server.close(() => {
      console.log('[Server] Servidor HTTP local encerrado');
    });
    server = null;
    serverPort = null;
    extensionApiAvailable = false;
  }
}

/**
 * Retorna a URL do servidor HTTP local
 */
export function getServerUrl(): string | null {
  if (serverPort) {
    return `http://localhost:${serverPort}`;
  }
  return null;
}

/**
 * Informa se a API que a extensão do Chrome procura (porta 8765) está no ar.
 */
export function isExtensionApiAvailable(): boolean {
  return extensionApiAvailable;
}
