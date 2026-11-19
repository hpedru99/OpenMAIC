#!/bin/zsh
# Inicia o banco (no SSD) e o OpenMAIC em http://localhost:3000
set -e
SSD="/Volumes/Apps external/Developer"
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/opt/postgresql@16/bin:$PATH"
export LC_ALL=en_US.UTF-8
if [ ! -d "$SSD" ]; then echo "SSD 'Apps external' não está conectado."; exit 1; fi
if ! pg_ctl -D "$SSD/openmaic-data/postgres" status >/dev/null 2>&1; then
  pg_ctl -D "$SSD/openmaic-data/postgres" -l "$SSD/openmaic-data/postgres.log" -o "-p 5433" -w start
fi
cd "$SSD/OpenMAIC"
if ! grep -q '^OPENAI_API_KEY=.\+' .env.local; then
  echo "Coloque sua chave em .env.local (OPENAI_API_KEY=...) antes de iniciar."; exit 1
fi
pnpm dev
