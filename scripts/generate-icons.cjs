/**
 * Gera todos os ícones do YTView a partir de um único arquivo de origem.
 *
 * Fonte: build/source/icon-source.png (quadrado, com transparência).
 * Para trocar o ícone do app, substitua esse arquivo e rode:
 *
 *   node scripts/generate-icons.cjs
 *
 * Redimensiona com `sips`, que vem no macOS — sem dependências novas.
 * O ícone da barra de menu é desenhado à parte: o macOS espera uma silhueta
 * monocromática, e reduzir o ícone colorido viraria uma mancha.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'build', 'source', 'icon-source.png');

/** Tamanhos que o electron-builder aproveita para .icns e .ico. */
const APP_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];

/** O que a extensão do Chrome declara no manifest. */
const EXTENSION_SIZES = [16, 48, 128];

function resize(destination, size) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(SOURCE, destination);
  execFileSync('sips', [
    '-s', 'format', 'png',
    '-z', String(size), String(size),
    destination,
    '--out', destination,
  ], { stdio: 'ignore' });
}

// ===== Ícone da barra de menu (template do macOS) =====

function createPNG(width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const crc32Table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crc32Table[i] = c;
  }

  function crc32(buf) {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ crc32Table[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
  }

  function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const combined = Buffer.concat([Buffer.from(type), data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(combined), 0);
    return Buffer.concat([length, combined, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profundidade
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // sem filtro
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = y * (1 + width * 4) + 1 + x * 4;
      raw[dst] = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
      raw[dst + 3] = pixels[src + 3];
    }
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * A mesma ideia do ícone do app — um play com uma janelinha no canto —
 * reduzida a uma silhueta preta, que é o que um template do macOS aceita.
 * O sistema inverte a cor sozinho conforme o tema da barra.
 */
function generateTrayIcon(size) {
  const pixels = new Uint8Array(size * size * 4);
  const SUPERSAMPLE = 4; // suaviza as bordas
  const unit = size / 16; // grade de 16pt, o tamanho lógico da barra de menu

  const play = {
    x: 2.2 * unit,
    y: 3.0 * unit,
    w: 8.0 * unit,
    h: 9.4 * unit,
  };
  const pip = {
    x: 7.6 * unit,
    y: 8.0 * unit,
    w: 6.6 * unit,
    h: 5.0 * unit,
    border: Math.max(1, unit * 0.9),
  };

  const insidePlay = (x, y) => {
    // Triângulo apontando para a direita, com o vértice na altura do meio
    if (x < play.x || x > play.x + play.w) return false;
    const progress = (x - play.x) / play.w;
    const half = (play.h / 2) * (1 - progress);
    return Math.abs(y - (play.y + play.h / 2)) <= half;
  };

  const insideRect = (x, y, r) =>
    x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  const insidePipBorder = (x, y) => {
    if (!insideRect(x, y, pip)) return false;
    const inner = {
      x: pip.x + pip.border,
      y: pip.y + pip.border,
      w: pip.w - pip.border * 2,
      h: pip.h - pip.border * 2,
    };
    return !insideRect(x, y, inner);
  };

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let hits = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = px + (sx + 0.5) / SUPERSAMPLE;
          const y = py + (sy + 0.5) / SUPERSAMPLE;

          // A janelinha recorta o play com uma folga, para as duas formas
          // não se encostarem no tamanho da barra de menu.
          const gap = unit * 0.7;
          const inPipWithGap = insideRect(x, y, {
            x: pip.x - gap,
            y: pip.y - gap,
            w: pip.w + gap * 2,
            h: pip.h + gap * 2,
          });

          if (insidePipBorder(x, y) || (insidePlay(x, y) && !inPipWithGap)) {
            hits++;
          }
        }
      }

      const idx = (py * size + px) * 4;
      pixels[idx] = 0;
      pixels[idx + 1] = 0;
      pixels[idx + 2] = 0;
      pixels[idx + 3] = Math.round((hits / (SUPERSAMPLE * SUPERSAMPLE)) * 255);
    }
  }

  return createPNG(size, size, pixels);
}

// ===== Execução =====

if (!fs.existsSync(SOURCE)) {
  console.error(`Ícone de origem não encontrado: ${SOURCE}`);
  process.exit(1);
}

console.log('Ícone do app (a partir de build/source/icon-source.png)');
for (const size of APP_SIZES) {
  const dest = path.join(ROOT, 'build', `${size}x${size}.png`);
  resize(dest, size);
  console.log(`  build/${size}x${size}.png`);
}

// electron-builder usa build/icon.png como entrada de .icns/.ico
resize(path.join(ROOT, 'build', 'icon.png'), 1024);
resize(path.join(ROOT, 'apps', 'desktop', 'build', 'icon.png'), 1024);
console.log('  build/icon.png');
console.log('  apps/desktop/build/icon.png');

console.log('Ícones da extensão do Chrome');
for (const size of EXTENSION_SIZES) {
  const dest = path.join(
    ROOT, 'apps', 'chrome-extension', 'public', 'icons', `icon${size}.png`
  );
  resize(dest, size);
  console.log(`  apps/chrome-extension/public/icons/icon${size}.png`);
}

console.log('Ícone da barra de menu (silhueta)');
const trayTargets = [
  [path.join(ROOT, 'assets'), 16, 'tray-iconTemplate.png'],
  [path.join(ROOT, 'assets'), 32, 'tray-iconTemplate@2x.png'],
  [path.join(ROOT, 'assets'), 22, 'tray-icon.png'],
  [path.join(ROOT, 'apps', 'desktop', 'assets'), 16, 'tray-iconTemplate.png'],
  [path.join(ROOT, 'apps', 'desktop', 'assets'), 32, 'tray-iconTemplate@2x.png'],
  [path.join(ROOT, 'apps', 'desktop', 'assets'), 22, 'tray-icon.png'],
];

for (const [dir, size, name] of trayTargets) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), generateTrayIcon(size));
  console.log(`  ${path.relative(ROOT, path.join(dir, name))}`);
}

console.log('\nPronto. O electron-builder converte build/icon.png para .icns e .ico.');
