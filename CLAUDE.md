# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Full build (all packages)
pnpm turbo build

# Dev servers (API port 8080 + Web port 3000)
pnpm dev

# Lint / Format / Type check
pnpm lint
pnpm format
pnpm turbo type-check

# Tests (vitest, currently packages/shared only)
pnpm test

# Run single package
pnpm --filter @calendar-hub/api dev
pnpm --filter @calendar-hub/web dev
pnpm --filter @calendar-hub/shared test

# Deploy (manual, requires GCP auth)
bash infra/deploy-api.sh
bash infra/deploy-web.sh
```

## Architecture

Turborepo monorepo with pnpm workspaces. TypeScript throughout.

```
apps/api     — Hono on Cloud Run (port 8080). Firebase Admin Auth middleware.
apps/web     — Next.js 15 App Router on Cloud Run (port 3000). Firebase client Auth.
packages/shared       — Shared types (CalendarEvent, UserProfile, etc.), AES-256-GCM crypto, free-time calculator
packages/calendar-sdk — CalendarAdapter interface with Google and TimeTree implementations
packages/ai-sdk       — Vertex AI Gemini 2.5 Flash integration for schedule suggestions
```

**Dependency flow:** `apps/api` → `shared`, `calendar-sdk`, `ai-sdk`. `apps/web` → `shared` only. SDKs → `shared`.

### API Routes (apps/api)

| Route                  | Purpose                                                                |
| ---------------------- | ---------------------------------------------------------------------- |
| `/api/auth/*`          | OAuth flows, account connect/disconnect, TimeTree session registration |
| `/api/calendars/*`     | List calendars, CRUD events, `/events/merged` for cross-account view   |
| `/api/ai/*`            | Generate suggestions, list/update suggestions                          |
| `/api/notifications/*` | Email notification settings and test send                              |
| `/api/profile/*`       | User profile and preferences                                           |

### Calendar Adapter Pattern

`CalendarAdapter` interface in `packages/calendar-sdk` with two implementations:

- **GoogleCalendarAdapter** — Google Calendar API v3 via `googleapis`
- **TimeTreeAdapter** — Unofficial web API (session cookie auth, not OAuth). Server-side login is blocked by TimeTree's bot protection; sessions must be registered directly via browser.

### Token Storage

Connected account tokens are AES-256-GCM encrypted in Firestore (`users/{uid}/connectedAccounts/{accountId}`). Encryption key from Secret Manager (`token-encryption-key`). Key format detection in `token-store.ts`: 44-char base64 → decode; otherwise → SHA-256 hash.

## GCP Infrastructure

- **Project:** `calendar-hub-prod` (asia-northeast1)
- **Cloud Run:** `calendar-hub-api`, `calendar-hub-web` (min 0, max 3 instances)
- **Firestore:** Native mode
- **Secret Manager:** `google-client-id`, `google-client-secret`, `token-encryption-key`, `timetree-password`
- **Artifact Registry:** `calendar-hub` repo with cleanup policy (keep latest 2)

## Key Conventions

- Pre-commit hooks via Husky: ESLint + Prettier on staged files
- Branch protection on `main`: PR required, CI (quality job) must pass
- `NEXT_PUBLIC_*` env vars are baked into Next.js at build time (Docker build args)
- Firebase client SDK in `apps/web/src/lib/firebase.ts` guards against missing API key (for CI builds)
