# syntax=docker/dockerfile:1
#
# aether-zone/pistis — the api and the web app in a single container.
#
#   docker build -t aether-zone/pistis .
#   docker run --rm -p 3000:3000 -v pistis-data:/data aether-zone/pistis
#
# Prefer the separate aether-zone/pistis-api and aether-zone/pistis-web images
# where you can: they scale, restart and roll out independently. This one is for
# a single-container host, and both processes share its fate.

FROM node:22-bookworm-slim AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY api/package.json api/
COPY contract/package.json contract/
COPY web/package.json web/
COPY api-e2e/package.json api-e2e/
COPY web-e2e/package.json web-e2e/

RUN pnpm install --frozen-lockfile

COPY . .

# One install, both builds — the reason this image is cheaper to build than the
# two separate ones run back to back.
RUN pnpm --filter @pistis/api --filter @pistis/web build

RUN pnpm deploy --filter @pistis/api --prod /deploy


FROM node:22-bookworm-slim AS runner

RUN apt-get update \
    && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    API_PORT=3001 \
    WEB_PORT=3000 \
    DATABASE_PATH=/data/pistis.sqlite

WORKDIR /app

COPY --from=builder --chown=node:node /deploy/node_modules ./api/node_modules
COPY --from=builder --chown=node:node /deploy/package.json ./api/package.json
COPY --from=builder --chown=node:node /workspace/api/dist ./api/
COPY --from=builder --chown=node:node /workspace/web/.next/standalone ./web/
COPY --from=builder --chown=node:node /workspace/web/.next/static ./web/web/.next/static
COPY --from=builder --chown=node:node /workspace/web/public ./web/web/public
COPY --chown=node:node docker/entrypoint.sh /usr/local/bin/pistis-entrypoint

RUN chmod +x /usr/local/bin/pistis-entrypoint \
    && mkdir -p /data && chown node:node /data

VOLUME ["/data"]

USER node

# Only the web port is published: the api is reached through the container's
# own loopback. Publish API_PORT as well to expose the api directly.
EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["/usr/local/bin/pistis-entrypoint"]
