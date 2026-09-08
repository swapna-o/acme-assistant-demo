# One container for the whole demo: the Python policy search on :8930 (internal) and
# the Node server on $PORT, which serves the built client and proxies search to Python.
# Build context is the workspace root (see render.yaml / fly.toml), which contains
# timeoff-agent/ and a copy of hr-policy-rag/ in deploy/demo/hr-policy-rag/.
FROM node:22-bookworm-slim AS client
WORKDIR /app
COPY timeoff-agent/package.json timeoff-agent/package-lock.json ./
RUN npm ci
COPY timeoff-agent/ ./
RUN npm run build && npm prune --omit=dev

FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
# search service
COPY deploy/demo/hr-policy-rag/ ./rag/
RUN pip install --no-cache-dir numpy && cd rag && python -m scripts.ingest
# demo server + built client
COPY --from=client /app/dist ./demo/dist
COPY --from=client /app/node_modules ./demo/node_modules
COPY --from=client /app/package.json ./demo/package.json
COPY deploy/demo/start.sh ./start.sh
RUN chmod +x ./start.sh
ENV PORT=3000 NODE_ENV=production RAG_URL=http://127.0.0.1:8930 RAG_PORT=8930 DEMO_RESET_MINUTES=30
EXPOSE 3000
CMD ["./start.sh"]
