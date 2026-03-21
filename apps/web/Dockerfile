FROM node:22-slim AS base
RUN corepack enable pnpm

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --prod=false
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo build --filter=@calendar-hub/web

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public 2>/dev/null || true

EXPOSE 3000
ENV PORT=3000
CMD ["node", "apps/web/server.js"]
