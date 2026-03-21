FROM node:22-slim AS base
RUN corepack enable pnpm

FROM base AS builder
WORKDIR /app

# Firebase公開設定（ビルド時にSSGで必要）
ARG NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAUqbyrfO68ZdTPf4mUHqzYoFy5CUmS37E
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=calendar-hub-prod.firebaseapp.com
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID=calendar-hub-prod
ARG NEXT_PUBLIC_FIREBASE_APP_ID=1:390047956089:web:a41b04887895fcade868a8
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=390047956089
ARG NEXT_PUBLIC_API_URL=http://localhost:8080

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

EXPOSE 3000
ENV PORT=3000
CMD ["node", "apps/web/server.js"]
