#!/usr/bin/env bash
set -e
cd /srv/rag && PORT="${RAG_PORT:-8930}" python3 webapp.py &
cd /srv/demo && exec node dist/server/server/index.js
