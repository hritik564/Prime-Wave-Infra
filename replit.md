# Prime Wave — Backend API

Production-grade Express/TypeScript/Prisma backend for the Prime Wave platform.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — build + start the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-server run db:generate` — regenerate Prisma client after schema changes
- `pnpm --filter @workspace/api-server run db:push` — push schema changes to DB (dev only)
- `pnpm --filter @workspace/api-server run db:migrate` — create a named migration (production-safe)
- Required env: `DATABASE_URL`, `JWT_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Prisma ORM 5.22.0
- Auth: JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`)
- Validation: Zod 3
- Build: esbuild (ESM bundle)

## Where things live

```
artifacts/api-server/
  prisma/schema.prisma       — single source of truth for DB schema
  src/
    config/
      env.ts                 — Zod-validated env config (fails fast on missing vars)
      prisma.ts              — PrismaClient singleton
    shared/
      types.ts               — AuthPayload, AuthenticatedRequest
      constants.ts           — HTTP_STATUS enum
      response.ts            — sendSuccess / sendCreated / sendError helpers
    middleware/
      error.middleware.ts    — AppError class + centralized error handler
      validate.middleware.ts — Zod schema → Express middleware
      auth.middleware.ts     — requireAuth / requireAdminAuth JWT guards
    auth/                    — register + login flows
    users/                   — profile endpoint
    admin/                   — admin login
    wallets/                 — placeholder (Sprint 2)
    investments/             — placeholder (Sprint 2)
    deposits/                — placeholder (Sprint 2)
    withdrawals/             — placeholder (Sprint 2)
    binary/                  — placeholder (Sprint 3)
    levelIncome/             — placeholder (Sprint 3)
    salary/                  — placeholder (Sprint 3)
    cron/                    — placeholder (Sprint 2+)
```

## API Endpoints (Sprint 1)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | — | Register user, auto-creates wallet |
| POST | `/api/auth/login` | — | Login, returns JWT |
| GET | `/api/users/profile` | Bearer JWT | Full profile + wallet balances |
| POST | `/api/admin/login` | — | Admin login, role-aware JWT |
| GET | `/api/healthz` | — | Health check |

## Database Models (Sprint 1)

- **User** — email, username, phone, bcrypt hash, status (ACTIVE/INACTIVE/SUSPENDED), referral chain
- **Admin** — email, bcrypt hash, role (SUPER_ADMIN / FINANCE_ADMIN / SUPPORT_ADMIN / REWARD_MANAGER)
- **Wallet** — depositWallet / incomeWallet / withdrawalWallet (Decimal 18,8), 1-to-1 with User

## Architecture decisions

- Prisma 5.22 pinned (not v7) — v7 dropped `url` from schema.prisma, requires `prisma.config.ts` and major migration
- `bcryptjs` used over `bcrypt` — pure JS, no native bindings, bundles cleanly with esbuild
- `AppError` class centralizes all business errors; Prisma P2002/P2025 codes mapped in error middleware
- JWT payload carries `type: "user" | "admin"` + `role` for admins — single secret, role checked in middleware
- Wallet created atomically with User via Prisma nested `create` in a single transaction

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After any schema change: run `db:generate` then `db:push` (dev) or `db:migrate` (prod)
- `@prisma/client`, `@prisma/engines`, and `prisma` must stay in `onlyBuiltDependencies` in `pnpm-workspace.yaml`
- `@prisma/client` is externalized in `build.mjs` — must be present in `node_modules` at runtime
- Do not upgrade Prisma past 5.x without carefully reading the v6/v7 migration guides
