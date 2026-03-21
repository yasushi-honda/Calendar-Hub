FROM node:22-slim AS base
RUN corepack enable pnpm

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/calendar-sdk/package.json packages/calendar-sdk/
COPY packages/ai-sdk/package.json packages/ai-sdk/
RUN pnpm install --frozen-lockfile --prod=false
COPY . .
RUN pnpm turbo build --filter=@calendar-hub/api

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# monorepo全体のnode_modules + 各パッケージのdist + package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/packages/calendar-sdk/dist ./packages/calendar-sdk/dist
COPY --from=builder /app/packages/calendar-sdk/package.json ./packages/calendar-sdk/
COPY --from=builder /app/packages/calendar-sdk/node_modules ./packages/calendar-sdk/node_modules
COPY --from=builder /app/packages/ai-sdk/dist ./packages/ai-sdk/dist
COPY --from=builder /app/packages/ai-sdk/package.json ./packages/ai-sdk/
COPY --from=builder /app/packages/ai-sdk/node_modules ./packages/ai-sdk/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules

EXPOSE 8080
CMD ["node", "apps/api/dist/index.js"]
