# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Target module (`TargetModule`, `TargetService`, `TargetController`) for OKRs and target tracking
- Cascading target alignment supporting three level hierarchy (`COMPANY`, `TEAM`, `INDIVIDUAL`), depth limits, circular reference checks, and automatic progress rollup calculations
- Strategy map endpoint (`GET /targets/strategy-map`) returning the nested target alignment tree with progress percentages
- Progress entry logging with file attachments via Cloudinary integration and status guards blocking updates on completed or missed targets
- Target Socket.io real time gateway event broadcasting (`target:created`, `target:updated`, `target:deleted`, `targetEntry:added`, `targetEntry:deleted`)
- Unit test suite for target service covering target CRUD, alignment validation, progress rollups, strategy map generation, and access control
- Task management core module (`TaskModule`, `TaskService`, `TaskController`) with task creation, filtering, update, deletion, and role based visibility scoping
- Task status lifecycle tracking (`NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, `OVERDUE`, `COMPLETED_LATE`) enforcing deadline and overdue transition rules
- Task dependency validation ensuring a task cannot move to `IN_PROGRESS` while its required prior task remains unfinished
- Subtask management endpoints supporting item completion toggling and list reordering
- Threaded task commenting system supporting top level comments and nested replies
- Task attachment file uploads using Cloudinary integration in `UploadService`
- Real time WebSockets gateway (`TaskGateway`) broadcasting live updates for task, subtask, comment, and attachment events
- Cloudinary upload module (`UploadModule`, `UploadService`) with avatar/logo upload support, registered in `AppModule`
- `x-org-id` to the CORS `allowedHeaders` list so the organization header fallback is not blocked by preflight checks
- `exports: [UserService]` to `UserModule` so other modules can inject the user service
- `exports: [DepartmentService]` to `DepartmentModule` so other modules can inject the department service
- Performance module (`PerformanceModule`, `PerformanceService`, `PerformanceController`) tracking per user task completion metrics, on time rate, and a weighted performance score with an automatic letter rating (see spec 0002)
- Performance score recalculation triggered by task lifecycle events (created, status changed, deleted, reassigned) via `@nestjs/event-emitter` and processed asynchronously through a BullMQ queue and `PerformanceProcessor`
- Task event classes (`TaskCreatedEvent`, `TaskStatusChangedEvent`, `TaskDeletedEvent`, `TaskReassignedEvent`) published from `TaskService` on every task write so downstream modules react without direct coupling
- Performance history snapshots (`PerformanceSnapshot` model) captured daily by a scheduled cron job, with a unique constraint per org, user, and period to prevent duplicates
- Performance trend endpoint (`GET /performances/:userId/trend`) returning snapshot history filtered by period (`daily`, `weekly`, `monthly`)
- Organisation level performance stats endpoint (`GET /performances/stats`) aggregating averages, rating distributions, and top/bottom performers (admin and owner only)
- Manual recalculation trigger (`POST /performances/recalculate`) allowing admins and owners to force a full org wide score refresh
- AI powered insight generation (`POST /performances/:userId/insights/generate`) using `LlmService` to produce natural language analysis of a user's task performance, stored in the `AIInsight` model
- Daily automated insight generation cron job (1:00 AM) that creates AI insights only when a user's score has shifted beyond a configurable threshold since the last snapshot
- `LlmModule` and `LlmService` abstracting LLM calls behind a provider switch (`gemini` or `openai`) configured via `LLM_PROVIDER` and `LLM_API_KEY` environment variables
- `SchedulerModule` with `PerformanceCronTask` running three cron jobs: overdue task detection (every 10 minutes), daily performance snapshots (midnight), and daily AI insight generation (1:00 AM)
- `GatewayModule` extracting `TaskGateway` into a shared module so it is registered once and injected wherever needed instead of being listed as a provider in each feature module
- Prisma `Performance`, `PerformanceSnapshot`, and `AIInsight` models with organisation and user scoping, cascading deletes, and composite unique constraints
- WebSocket events `performance:updated` and `insight:generated` broadcast to the organisation room after each recalculation or insight creation
- `EventEmitterModule` and `BullModule` (Redis backed) registered in `AppModule` as global infrastructure for event driven processing
- `@nestjs/event-emitter`, `@nestjs/schedule`, `bullmq`, and `openai` as new runtime dependencies
- Unit test suites for `PerformanceService`, `PerformanceController`, `PerformanceProcessor`, `PerformanceCronTask`, and `LlmService`

### Changed
- `TaskGateway` is no longer listed as a provider in `TaskModule` and `TargetModule`; it is now imported through `GatewayModule` to avoid duplicate Socket.io server instances
- `DepartmentService` internal formatting condensed (no behavioural change)

### Fixed
- Access check for individual target progress logging where non assignees were granted access while assignees were blocked
- Route matching and error handling order in `findOne` where access checks executed before validating target existence
- Target creation validation rule that blocked assignees on team targets instead of restricting them on company targets only
- Filter parameter handling in `findAll` so search parameters combine with role scoping rules instead of overwriting them
- `RolesGuard` read `activeorganisationId` (lowercase, British spelling) from the session instead of `activeOrganizationId`, which meant the guard never received the organization ID from Better Auth's session and every role protected route would fail unless the `x-org-id` header was sent
- `reassignTeam` where clause used `organzationId` (missing letter "i"), so Prisma silently ignored the organization filter and the bulk update could match profiles across all organizations instead of only the active one
- Department controller route changed from `/department` to `/departments` (plural) to follow REST conventions and match the Phase 2 API documentation
- Department `findAll` endpoint changed from `GET /departments/all` to `GET /departments` to follow standard collection patterns
- User `getAll` endpoint changed from `GET /users/all` to `GET /users` to match the same convention
