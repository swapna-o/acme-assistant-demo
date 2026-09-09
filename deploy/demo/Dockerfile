# One container for the whole demo: the Python policy search on :8930 (internal) and
# the Node server on $PORT, which serves the built client and proxies search to Python.
# Build context is the repository root (see render.yaml).
FROM node:22-bookworm-slim AS client
WORKDIR /app
COPY timeoff-agent/package.json timeoff-agent/package-lock.json ./
RUN npm ci
COPY timeoff-agent/ ./
RUN npm run build && npm prune --omit=dev

# Final image: the official Node image plus Debian's Python 3, no third-party installers.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-numpy \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
# search service (pure Python + numpy), index built at image build time
COPY deploy/demo/hr-policy-rag/ ./rag/
RUN cd rag && python3 -m scripts.ingest
# demo server + built client
COPY --from=client /app/dist ./demo/dist
COPY --from=client /app/node_modules ./demo/node_modules
COPY --from=client /app/package.json ./demo/package.json
COPY deploy/demo/start.sh ./start.sh
RUN chmod +x ./start.sh
ENV PORT=3000 NODE_ENV=production RAG_URL=http://127.0.0.1:8930 RAG_PORT=8930 DEMO_RESET_MINUTES=30
EXPOSE 3000
CMD ["./start.sh"]
