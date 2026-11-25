# syntax=docker/dockerfile:1
FROM node:22-slim AS build

RUN corepack enable
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/package.json
COPY apps/api/package.json apps/api/package.json

RUN pnpm install --frozen-lockfile --filter @companion/api...

COPY packages/core packages/core
COPY apps/api apps/api

RUN pnpm --filter @companion/api build \
 && pnpm --filter @companion/api deploy --prod --legacy /out

FROM node:22-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /out ./

EXPOSE 4000
CMD ["node", "dist/index.js"]
