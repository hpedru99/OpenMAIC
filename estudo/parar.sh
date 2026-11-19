#!/bin/zsh
# Para o banco de dados (rode antes de desconectar o SSD)
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
pg_ctl -D "/Volumes/Apps external/Developer/openmaic-data/postgres" stop
