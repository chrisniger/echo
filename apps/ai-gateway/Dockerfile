FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/ai-gateway ./apps/ai-gateway
COPY packages/shared-types ./packages/shared-types
COPY packages/shared-config ./packages/shared-config
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter @echo-gpt/shared-types build
RUN pnpm --filter @echo-gpt/shared-config build
RUN pnpm --filter @echo-gpt/ai-gateway build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/apps/ai-gateway/dist ./dist
COPY --from=builder /app/apps/ai-gateway/package.json ./
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 4001
CMD ["node", "dist/index.js"]
