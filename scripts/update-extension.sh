#!/bin/bash
# Atualiza a cópia da extensão que o Chrome carrega, sem apagar a pasta.
#
# Apagar e recriar o diretório faz o Chrome perder o manifest e desativar a
# extensão ("não foi possível carregar"), exigindo recarregar na mão. rsync
# sincroniza o conteúdo mantendo a pasta no lugar.
set -e

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
ORIGEM="$RAIZ/apps/chrome-extension/dist"
DESTINO="${1:-$HOME/Downloads/YTView-extensao}"

if [ ! -f "$ORIGEM/manifest.json" ]; then
  echo "Build não encontrado. Rode antes:"
  echo "  pnpm turbo run build --filter=@ytview/chrome-extension"
  exit 1
fi

mkdir -p "$DESTINO"
rsync -a --delete "$ORIGEM/" "$DESTINO/"

echo "Extensão atualizada em $DESTINO"
echo "No chrome://extensions, clique em ⟳ (Atualizar) no cartão do YTView."
