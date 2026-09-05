# AGENTS.md — NestJS Backend
Generic ruleset for any NestJS backend. Copy into a new project; only §1 changes.

## 1. Project Context
- **Project:** TeamOs-backend
- **Package manager:** npm · **Node:** v26.4.0 · **NestJS:** v11+
- **HTTP adapter:** Express — don't switch to Fastify without discussion
- **Deploy target:** Railway / Render

## 2. Stack
NestJS · TypeScript strict · Prisma · Better Auth (`@thallesp/nestjs-better-auth`) · BullMQ + ioredis · Socket.io · `@nestjs/schedule` · `@nestjs/swagger` · `@nestjs/throttler` · Jest + Supertest.
Don't swap any of these without flagging it first.

## 3. Session Workflow (JSM Skills, if installed)
- `/architect` before any non-trivial module/feature — confirm the plan before writing code.
- `/review` after any feature, before calling it done.
- `/remember restore` at session start, `/remember save` at session end.
- `/recover` when something breaks: targeted fix (isolated bug) → hard reset (context polluted) → rethink (wrong module boundary — move the feature, don't patch around it).

## 4. Module Rules
- **Never `new` anything the DI container should own** (`PrismaClient`, services, SDK clients). Constructor injection only.
- **Controllers are thin — one call to one service method.** Business logic, transactions, orchestration live in services.
- **Feature-based folders, not layer-based** (`modules/<feature>/`, not root-level `controllers/`, `services/`). Layer-based structure stops scaling past ~15 endpoints.
- **Infra integrations (`lib/`) are `@Global()`, imported once** in `AppModule`: Prisma, mail, storage, queue root. Feature modules inject the service, never reconstruct the client.
- **A module exports only what other modules need** — not everything.
- **Circular deps: fix the structure before reaching for `forwardRef()`.** Extract a shared module or use an event emitter first.

## 5. Folder Structure
```
src/
├── main.ts                 # bootstrap only — pipes, filters, Swagger, listen()
├── app.module.ts
├── lib/                     # infra — one subfolder each, @Global()
│   ├── prisma/  mail/  storage/  queue/  auth.ts
├── modules/                 # one folder per feature
│   └── <feature>/
│       ├── <feature>.module.ts
│       ├── <feature>.controller.ts
│       ├── <feature>.service.ts
│       ├── <feature>.processor.ts   # if it owns a queue
│       └── dto/
├── gateway/                 # Socket.io gateways
├── scheduler/               # one file per cron task
└── common/                  # guards, decorators, interceptors, filters, pipes
```

**Naming:** `<name>.module|controller|service|guard|processor|task.ts`. DTOs: `<action>-<entity>.dto.ts` → class `CreateHabitDto`. Queue names lowercase-hyphenated. Env vars SCREAMING_SNAKE_CASE. Scaffold with `nest g module/controller/service <name>` — don't hand-write boilerplate.

## 6. Auth
- One auth approach, decided once, in `lib/auth.ts`. If Better Auth: instance lives in `lib/auth.ts` as a plain export (not a NestJS provider); the NestJS integration registers a **global guard** — every route protected by default, use `@AllowAnonymous()` to open one.
- Don't hand-roll JWT/bcrypt alongside an auth library that already provides sessions.
- App-specific user data extends the auth library's user table via a 1:1 profile model linked by `userId` — never edit the auth library's own tables.

## 7. Database
- `PrismaService` extends `PrismaClient`, `@Global()`, connects/disconnects on lifecycle hooks. Never instantiate `PrismaClient` elsewhere.
- Multi-step writes that must succeed/fail together → `prisma.$transaction()`.
- Soft delete: explicit `deletedAt`, filtered manually (`where: { deletedAt: null }`) — pick one pattern, apply everywhere.
- Complex aggregation → `$queryRaw` / `groupBy`, not multiple round-trips reduced in JS.
- **No query inside a loop — this includes existence/duplicate checks, not just data fetches.** If a `for`/`.map()` body calls `findFirst`, `findUnique`, `count`, or `create`/`update` once per iteration, that's N+1 even when it's only checking "does this already exist" rather than fetching related data. Fix: pull the loop's ID list, run one batched query with `{ in: [...] }` (or one `groupBy`/`createMany`), build a `Map`/`Set` keyed by ID, then loop over that in memory with no further queries. `Promise.all()` around the same per-iteration query still N+1s the database — it only removes the sequential-latency cost, not the query count. Applies equally to list endpoints, cron jobs, and dedup/guard checks before a write.
- Never hand-edit a generated migration. Backfills are a separate follow-up migration.
- Set `connection_limit` explicitly in production `DATABASE_URL`.

## 8. Security — non-negotiable, enabled once at the top of the pipeline
- `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` globally.
- `app.use(helmet())` before anything else in `main.ts`.
- CORS: explicit origin allowlist + `credentials: true` — never `origin: '*'` with credentials.
- Global `@nestjs/throttler`, stricter `@Throttle()` overrides on auth, AI/LLM, export, and webhook routes.
- **Verify a package exists on the real npm registry before installing it** — AI agents hallucinate plausible package names and attackers pre-register the exact hallucinated names as malware (slopsquatting).
- Webhook routes verify signature (HMAC/provider SDK) before processing — this is the one expected use of `@AllowAnonymous()`, and it replaces auth, not skips it.
- Never log tokens, passwords, session IDs, or full PII payloads.
- All secrets via env vars, no exceptions, no test-file shortcuts.
- Errors to the client never leak stack traces in production — clean `{ message, statusCode }` only; full detail server-side.
- Swagger (`/api/docs`) disabled or auth-gated in production.
- Before any prod deploy: confirm no scaffolded resource (DB, storage bucket, admin route) was left on permissive/default access from development.

## 9. Errors & Response Shape
- One global `HttpExceptionFilter` → `{ success: false, error: { code, message } }`.
- One global `TransformInterceptor` → `{ success: true, data }`. Controllers return raw data; don't wrap manually.
- Use Nest's built-in exceptions (`NotFoundException`, `ForbiddenException`, etc.). A service signals failure by throwing — not by returning `null` for the controller to interpret.

## 10. Queues & Scheduling
- Anything not needed for the HTTP response → BullMQ (`@InjectQueue`, `@Processor` + `WorkerHost`): derived-state recalculation, email/SMS, badge/achievement checks, exports, slow external calls.
- Set concurrency deliberately per queue — throttle queues hitting paid external APIs.
- Cron via `@nestjs/schedule`'s `@Cron()`. If multiple instances run in production, use a distributed lock so only one fires the job.
- Wire up queue monitoring (Bull Board or equivalent) from the start, not after a job silently fails in prod.

## 11. WebSockets
- One gateway per real-time concern, not one per feature.
- Track sockets per user as `Set<string>` (multi-tab/device), clean up on `handleDisconnect`.
- Emit to a room (`user:<id>`) via `server.to(room).emit()` — don't iterate all sockets.
- Gateways are thin transport — business logic stays in services; inject the gateway into services that need to notify clients.

## 12. Testing
- Unit tests co-located (`.spec.ts`) mock `PrismaService`/dependencies via `Test.createTestingModule` + `useValue`.
- E2E tests (`test/*.e2e-spec.ts`) run the real `AppModule` + test DB via `supertest`, with the same pipes/filters as `main.ts`.
- **Test the primary failure mode, not just the happy path** — this is the single most common gap in AI-assisted code (silent business-logic and error-handling failures, not exotic bugs).
- Coverage is a signal, not a target — prioritize streak/XP math, permission checks, webhook verification over percentage.
- Lint + typecheck + tests all pass before a feature counts as done.

## 13. Config & Docs
- All env access via `ConfigService` (`ConfigModule.forRoot({ isGlobal: true })`) — never raw `process.env` in a service.
- `.env.example` committed, kept in sync with actual usage.
- Every DTO: `@ApiProperty()`. Every controller: `@ApiTags()`. Protected routes: `@ApiBearerAuth()`/`@ApiCookieAuth()` matching the real auth scheme.

## 14. Agent Guardrails
- Don't install new deps (ORM, queue lib, auth lib, HTTP client) without flagging first; verify on npm before adding one.
- Don't put business logic in controllers "just this once."
- Don't import a service directly from another feature's folder — import what its module exports.
- Don't instantiate infra clients inside a feature service — inject the `lib/` wrapper.
- Don't skip DTO validation on any route, including internal-feeling ones.
- Don't add a new queue/gateway/cron task without checking whether an existing one already covers it.
- Ask before large structural changes (module redraws, ORM swap, auth strategy change); make small/medium changes directly.
- Match existing codebase patterns over "technically more correct" alternatives.
- Nothing is done without lint + typecheck + tests passing.
- **Don't skip `/architect` or `/review`** to move faster on anything beyond a trivial change.