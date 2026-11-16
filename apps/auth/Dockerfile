FROM node:24.22 AS build

WORKDIR /

COPY  package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY turbo.json ./
COPY packages/ ./packages/
COPY apps/auth/ ./apps/auth/

RUN corepack enable && corepack prepare pnpm@12.21.0 --activate
RUN pnpm install --frozen-lockfile
RUN pnpm build:packages
RUN pnpm build

# Deploy Auth with only its production dependencies and required workspace packages
RUN pnpm --filter auth --prod deploy --ignore-scripts /out
RUN cp -a /packages/contracts/dist /out/node_modules/@relay-ops/contracts/dist


FROM node:24-bookworm-slim AS runner

# OpenSSL
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build --chown=node:node /out ./
COPY --from=build --chown=node:node /apps/auth/dist ./dist


ENV NODE_ENV=production

EXPOSE 3002

USER node

CMD ["node", "dist/main.js"]
