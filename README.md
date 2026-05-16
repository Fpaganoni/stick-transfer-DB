# Stick Transfer — Backend API

NestJS + GraphQL + Prisma backend for **Stick Transfer**, a hockey talent marketplace connecting players, coaches, and clubs.

Stack:
- NestJS + GraphQL (Apollo)
- Prisma + PostgreSQL
- JWT + OAuth 2.0 (Google, Apple)
- WebSocket notifications (Socket.IO)
- Cloudinary + AWS S3 for file uploads
- Stripe for payments
- Search module (ElasticSearch / Algolia adapters)
- pnpm as package manager

## Quick Start

1. Copy `.env.example` to `.env` and fill values.
2. `pnpm install`
3. `pnpm prisma:generate`
4. `pnpm prisma:migrate`
5. `pnpm start:dev`
6. GraphQL playground: http://localhost:4000/graphql

## Core Modules

| Module | Purpose |
|--------|---------|
| **auth** | JWT + OAuth 2.0 (Google, Apple) |
| **users** | Profiles, avatars, CV uploads, career trajectories |
| **clubs** | Club management, membership, invitations |
| **jobs** | Job opportunities + applications (core feature) |
| **messaging** | Direct messages and conversations |
| **notifications** | Real-time WebSocket notifications |
| **explore** | Search/filter users and clubs |
| **payments** | Stripe payment intents |
| **uploads** | Cloudinary + S3 file upload orchestration |

## Key Commands

```bash
pnpm start:dev          # Dev server (watch mode)
pnpm build              # Production build
pnpm test               # Unit tests
pnpm test:e2e           # E2E tests
pnpm test:cov           # Coverage report
pnpm lint               # ESLint
pnpm prisma:generate    # Regenerate Prisma client
pnpm prisma:migrate     # Run pending migrations
pnpm prisma:seed        # Seed database
pnpm prisma:reset       # ⚠️ Reset DB (destructive)
```

## Notes

- Skeleton services for Cloudinary, S3, search, and Stripe — fill env vars and adapt as needed.
- WebSocket gateway (Socket.IO) — clients join rooms by userId for real-time notifications.
- Jobs module is the core feature: create opportunities, apply, review candidates.
