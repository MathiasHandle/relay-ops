FROM node:24.22 AS build

WORKDIR /

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/ ./packages/

RUN corepack enable && corepack prepare pnpm@12.21.0 --activate
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @relay-ops/app-db db:generate

WORKDIR /packages/app-db
USER node
