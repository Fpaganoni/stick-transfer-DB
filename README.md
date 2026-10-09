<div align="center">

# Stick Transfer — Backend API

**A hockey talent marketplace connecting players, coaches, umpires, and clubs.**

[![CI](https://img.shields.io/github/actions/workflow/status/Fpaganoni/stick-transfer-DB/ci.yml?branch=main&label=CI&logo=githubactions&logoColor=white)](https://github.com/Fpaganoni/stick-transfer-DB/actions/workflows/ci.yml)
[![Last commit](https://img.shields.io/github/last-commit/Fpaganoni/stick-transfer-DB?logo=git&logoColor=white)](https://github.com/Fpaganoni/stick-transfer-DB/commits)
[![Repo size](https://img.shields.io/github/repo-size/Fpaganoni/stick-transfer-DB)](https://github.com/Fpaganoni/stick-transfer-DB)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-package%20manager-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![GraphQL](https://img.shields.io/badge/GraphQL-Apollo%20Server%205-E10098?logo=graphql&logoColor=white)](https://www.apollographql.com/)
[![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4-010101?logo=socketdotio&logoColor=white)](https://socket.io/)
[![Jest](https://img.shields.io/badge/tested%20with-Jest-C21325?logo=jest&logoColor=white)](https://jestjs.io/)
[![Stripe](https://img.shields.io/badge/Stripe-payments-635BFF?logo=stripe&logoColor=white)](https://stripe.com/)
[![Cloudinary](https://img.shields.io/badge/Cloudinary-uploads-3448C5?logo=cloudinary&logoColor=white)](https://cloudinary.com/)

</div>

---

## Table of Contents

- [About](#about)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [Project Structure](#project-structure)
- [Modules](#modules)
- [Authentication & Authorization](#authentication--authorization)
- [Security Hardening](#security-hardening)
- [Testing](#testing)
- [Further Documentation](#further-documentation)

---

## About

Stick Transfer is the backend of a **job marketplace for the hockey world**. Clubs publish job opportunities, and players, coaches, and umpires build profiles, follow each other, message, and apply.

It exposes a **GraphQL API** (port `4000` by default) on top of **PostgreSQL**, plus a small REST surface for health checks and Google OAuth, and a **Socket.IO** gateway for real-time notifications.

> This is a job marketplace, **not** a social feed: there are no posts, comments, or stories. The `social` module only covers profile-level follow and like.

## Tech Stack

| Area | Technology |
|------|-----------|
| Framework | [NestJS 11](https://nestjs.com/) on Express 5 |
| Language | [TypeScript 5.9](https://www.typescriptlang.org/) |
| API | GraphQL via [Apollo Server 5](https://www.apollographql.com/) (`@nestjs/apollo`, schema-first SDL) |
| Database | [PostgreSQL](https://www.postgresql.org/) (Supabase-compatible) |
| ORM | [Prisma 5](https://www.prisma.io/) |
| Auth | JWT (`@nestjs/jwt`, `passport-jwt`), Google OAuth 2.0 (`passport-google-oauth20`), httpOnly session cookie, `bcrypt` |
| Real-time | [Socket.IO](https://socket.io/) (`@nestjs/websockets`) |
| File uploads | [Cloudinary](https://cloudinary.com/) (signed direct browser uploads), AWS S3 (skeleton) |
| Payments | [Stripe](https://stripe.com/) payment intents |
| Search | Elasticsearch / Algolia adapters (skeleton) |
| Validation | `class-validator` + `class-transformer` |
| Protection | `@nestjs/throttler` rate limiting, `graphql-depth-limit`, CORS allow-list |
| Testing | [Jest](https://jestjs.io/) + `ts-jest` + `supertest` |
| Tooling | pnpm, ESLint 9, GitHub Actions CI |

## Prerequisites

- **Node.js** 20 or newer
- **pnpm** (`npm install -g pnpm`, or `corepack enable`)
- **PostgreSQL** 15+ — local install, Docker, or a hosted instance such as [Supabase](https://supabase.com/)
- Optional, only for the matching feature: a Google OAuth client, a Cloudinary account, a Stripe key

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/Fpaganoni/stick-transfer-DB.git
cd stick-transfer-DB
pnpm install
```

### 2. Start a PostgreSQL database

Skip this step if you already have one. Quick option with Docker:

```bash
docker run --name stick-transfer-db \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=stick_transfer \
  -p 5432:5432 -d postgres:15
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Fill in at least these values (see [Environment Variables](#environment-variables) for the rest):

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/stick_transfer
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/stick_transfer
JWT_SECRET=<output of: openssl rand -base64 48>
FRONTEND_URL=http://localhost:3000
```

### 4. Generate the Prisma client and apply migrations

```bash
pnpm prisma:generate
npx prisma migrate deploy      # applies every migration in prisma/migrations
```

> `pnpm prisma:migrate` runs `prisma migrate dev --name init` (interactive, meant for creating new migrations during development). Use `migrate deploy` to just apply the existing ones.

### 5. (Optional) Seed sample data

```bash
pnpm prisma:seed
```

### 6. Run the server

```bash
pnpm start:dev
```

| Endpoint | URL |
|----------|-----|
| GraphQL API + Playground (non-production) | http://localhost:4000/graphql |
| Health check | http://localhost:4000/health |
| Google OAuth start | http://localhost:4000/auth/google |

### 7. Try your first query

Open the Playground and run:

```graphql
query {
  jobOpportunities {
    id
    title
  }
}
```

### Production build

```bash
pnpm build
pnpm start:prod
```

## Environment Variables

Defined in [.env.example](.env.example). Never commit your real `.env`.

| Variable | Required | Description |
|----------|:--------:|-------------|
| `DATABASE_URL` | yes | Postgres connection string (pooled connection on Supabase) |
| `DIRECT_URL` | yes | Direct Postgres connection used by Prisma migrations |
| `JWT_SECRET` | yes | Long random string used to sign JWTs |
| `JWT_EXPIRES_IN` | no | Token lifetime, e.g. `1h` |
| `FRONTEND_URL` | yes | Exact frontend origin, used for CORS and OAuth redirects |
| `NODE_ENV` | no | Set to `production` when deployed (secure cookies, Playground off) |
| `PORT` | no | HTTP port, defaults to `4000` |
| `AUTH_COOKIE_CROSS_SITE` | no | `true` / `false` to force `SameSite=None; Secure` or `Lax` on the session cookie |
| `TRUST_PROXY` | no | Number of reverse-proxy hops in front of the app (usually `1` on PaaS); leave empty locally |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OAUTH_CALLBACK_URL` | for Google login | Google OAuth 2.0 credentials |
| `CLOUDINARY_URL` | for image uploads | `cloudinary://<key>:<secret>@<cloud_name>` |
| `STRIPE_SECRET_KEY` | for payments | Stripe secret key |

Search and S3 adapters read `ELASTICSEARCH_NODE`, `ALGOLIA_*`, and `AWS_S3_BUCKET` / `AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` when you enable them.

## Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm start:dev` | Dev server in watch mode |
| `pnpm build` | Production build into `dist/` |
| `pnpm start:prod` | Run the compiled build |
| `pnpm test` | Run Jest unit tests |
| `pnpm test:watch` | Jest in watch mode |
| `pnpm test:cov` | Coverage report |
| `pnpm lint` | ESLint |
| `pnpm prisma:generate` | Regenerate the Prisma client after schema changes |
| `pnpm prisma:migrate` | `prisma migrate dev` (creates a new migration) |
| `pnpm prisma:seed` | Seed the database |
| `pnpm prisma:reset` | **Destructive:** drops and recreates the database |

## Project Structure

```text
.
├── prisma/
│   ├── schema.prisma        # Data model
│   ├── migrations/          # SQL migrations (incl. CHECK constraints)
│   └── seed.ts              # Sample data
├── src/
│   ├── main.ts              # Bootstrap: CORS, cookies, validation pipe, filters
│   ├── app.module.ts        # Root module, throttling, static files
│   ├── graphql.module.ts    # Apollo config, depth limit, error formatting
│   ├── prisma.service.ts    # Shared Prisma client
│   ├── common/              # Exception filter, throttler guard, CORS, pagination
│   └── <feature>/           # module, resolver, service, specs, optional .graphql
└── test/                    # E2E specs
```

## Modules

| Module | Purpose |
|--------|---------|
| **auth** | JWT + Google OAuth strategies, session cookie, `GqlAuthGuard` |
| **users** | Registration, profiles, avatar/CV uploads, career trajectories |
| **clubs** | Club management, membership, invitations, admin controls |
| **teams** | Teams under a club |
| **jobs** | Job opportunities and applications (core marketplace feature) |
| **messaging** | Direct messages and conversations |
| **notifications** | Real-time WebSocket notifications |
| **explore** | Search and filter users and clubs |
| **social** | Profile-level follow and like |
| **news** | News articles |
| **report** | User / content reporting |
| **admin** | Super-admin operations and dashboard stats |
| **payments** | Stripe payment intents |
| **uploads** | Signed Cloudinary uploads, S3 orchestration |
| **search** | Algolia / Elasticsearch adapters (skeleton) |
| **health** | REST health check |

## Authentication & Authorization

- **Roles:** `PLAYER`, `COACH`, `CLUB`, `UMPIRE`, `SUPERADMIN`.
- **Session:** JWT stored in an httpOnly cookie; `Authorization: Bearer <token>` is accepted as a fallback.
- **Google OAuth:** start at `/auth/google`, callback at `/auth/google/callback`.
- **Public queries:** `users`, `clubs`, `jobOpportunities`, `jobOpportunity`, `user`, `players`, `coaches`, `news`.
- **Super-admin only:** `adminDashboardStats`, `superAdminNewsArticles`, `reports`, `report`, news CRUD, admin mutations.
- **Notifications socket:** authenticated on handshake and auto-joined to its own `user_<userId>` room.

See [AUTH_GUIDE.md](AUTH_GUIDE.md) for the full flow.

## Security Hardening

- Rate limiting: 100 requests / minute / IP
- GraphQL query depth limit of 5
- Strict CORS allow-list built from `FRONTEND_URL`
- Global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted`
- Prisma / database errors are masked as a generic 500 in GraphQL responses
- Signed Cloudinary uploads with strict owner-folder URL validation
- Database CHECK constraints for counts, salaries, year ranges, and self follow / like

## Testing

```bash
pnpm test        # unit tests
pnpm test:cov    # with coverage
pnpm lint
```

Unit specs live next to the code as `*.spec.ts`. The CI workflow (`.github/workflows/ci.yml`) runs lint and tests against a PostgreSQL 15 service container.

## Further Documentation

| File | Content |
|------|---------|
| [API_GUIDE.md](API_GUIDE.md) | API overview |
| [AUTH_GUIDE.md](AUTH_GUIDE.md) | Authentication flows |
| [DB_info.md](DB_info.md) | Database and schema notes |
| [GRAPHQL_EXAMPLES.md](GRAPHQL_EXAMPLES.md) | Sample queries and mutations |
| [GRAPHQL_QUERIES_CLUBS.md](GRAPHQL_QUERIES_CLUBS.md) | Club-related queries |
| [FRONTEND_S3_UPLOAD_GUIDE.md](FRONTEND_S3_UPLOAD_GUIDE.md) | Frontend upload integration |
| [RoadMap.md](RoadMap.md) | Roadmap |
