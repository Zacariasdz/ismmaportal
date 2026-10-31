#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo 'ERRO: Node.js não encontrado. Instale Node.js 24 LTS.'
  exit 1
fi
echo 'ISMMA - Portal de Atendimento'
echo 'Aceda: http://localhost:3000'
node server.js
