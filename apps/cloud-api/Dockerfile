FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/cloud-api ./apps/cloud-api
COPY packages/shared-types ./packages/shared-types
COPY packages/shared-config ./packages/shared-config
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter @echo-gpt/shared-types build
RUN pnpm --filter @echo-gpt/shared-config build
RUN pnpm --filter @echo-gpt/cloud-api build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/apps/cloud-api/dist ./dist
COPY --from=builder /app/apps/cloud-api/package.json ./
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 4000
CMD ["node", "dist/index.js"]
