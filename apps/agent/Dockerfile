# syntax=docker/dockerfile:1
FROM node:22-slim AS build

RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/package.json
COPY apps/agent/package.json apps/agent/package.json

RUN pnpm install --frozen-lockfile --filter @companion/agent...

COPY packages/core packages/core
COPY apps/agent apps/agent

RUN pnpm --filter @companion/agent build \
 && pnpm --filter @companion/agent deploy --prod --legacy /out

FROM node:22-slim AS runtime

# ffmpeg + ca-certificates are used by LiveKit audio tooling and TLS.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /out ./

CMD ["node", "dist/main.js", "start"]
