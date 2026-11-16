FROM node:24.22 AS build

WORKDIR /

COPY  package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY turbo.json ./
COPY packages/ ./packages/
COPY apps/server/ ./apps/server/

RUN corepack enable && corepack prepare pnpm@12.21.0 --activate
RUN pnpm install --frozen-lockfile
RUN pnpm build:packages
RUN pnpm build

# Deploy Server with only its production dependencies and required workspace packages
RUN pnpm --filter server --prod deploy --ignore-scripts /out
RUN cp -a /packages/contracts/dist /out/node_modules/@relay-ops/contracts/dist
RUN cp -a /packages/app-db/dist /out/node_modules/@relay-ops/app-db/dist
RUN cp -a /packages/backend-shared/dist /out/node_modules/@relay-ops/backend-shared/dist


FROM node:24-bookworm-slim AS runner

# OpenSSL
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build --chown=node:node /out ./
COPY --from=build --chown=node:node /apps/server/dist ./dist


ENV NODE_ENV=production

EXPOSE 3001

USER node

CMD ["node", "dist/main.js"]
