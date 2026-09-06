# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Executive analytics dashboard module (`AnalyticsModule`, `AnalyticsService`, `AnalyticsController`) aggregating organizational health across tasks, performance trends, complaints, targets, and recognitions with tiered role scoping (see spec 0009)
- Audit log module (`AuditLogModule`, `AuditLogQueryService`, `AuditLogController`) and global `AuditModule` (`AuditLogService`) providing immutable event logging for sensitive administrative actions, user changes, and CSV export capabilities (see spec 0009)
- Prisma `AuditLog` model with composite indexes on `(organizationId, createdAt)`, `(organizationId, action)`, and `(organizationId, userId)` for performant query filtering
- Audit log REST API endpoints: `GET /audit-logs` for paginated and filtered log queries, and `GET /audit-logs/export` for RFC-4180 compliant CSV downloads
- Analytics REST API endpoints providing specialized metric slices: `GET /analytics/dashboard`, `GET /analytics/task-metrics`, `GET /analytics/performance-trends`, `GET /analytics/department-comparison`, `GET /analytics/complaint-metrics`, `GET /analytics/target-progress`, `GET /analytics/recognition-summary`, and `GET /analytics/member-summary`
- Non blocking audit log integration wired into `DepartmentService` (head changes), `ComplaintService` (resolutions and dismissals), `TargetService` (deletions), `TaskService` (reassignments), and `ReviewService` (cycle activation, calibration, completion, and session finalization)
- Comprehensive test suites for `AuditLogService`, `AuditLogQueryService`, `AuditLogController`, `AnalyticsService`, and `AnalyticsController` bringing the test suite to 507 passing tests across 35 suites
- Notification module (`NotificationModule`, `NotificationService`, `NotificationController`, `NotificationProcessor`) providing in app notifications dispatched via BullMQ, real time WebSocket delivery, and optional email forwarding through Resend when the organization has email preferences enabled
- Notification REST API with paginated listing, read/unread toggling, deletion, and admin only email preference management endpoints
- `dispatchBulk` method using BullMQ `addBulk` to enqueue multiple notification jobs in a single Redis round trip, replacing the previous per job sequential dispatch
- `dispatchToMany` convenience method that fans out a single notification payload to multiple user IDs via `dispatchBulk`
- Notification severity map (`NOTIFICATION_SEVERITY_MAP`) mapping every `NotificationType` to a `NotificationSeverity` for consistent severity assignment
- Scheduled cron task (`NotificationCronTask`) with three automated detection jobs: deadline warnings for tasks due within 24 hours (every 10 minutes), missed target detection transitioning overdue targets to `MISSED` (every 10 minutes), and at risk target detection flagging targets within 3 days of deadline with below 50% progress (every hour)
- Complaint notification integration dispatching `COMPLAINT_CREATED` to targets and admins, and `COMPLAINT_STATUS_CHANGED` on status transitions via `dispatchToMany`
- Review notification integration dispatching `REVIEW_ASSIGNED` to eligible users on cycle activation
- Task notification integration dispatching `TASK_ASSIGNED` and `TASK_COMPLETED` to relevant users
- `emitNotification` method on `TaskGateway` for real time WebSocket delivery of notifications to individual user rooms
- Unit test suites for `NotificationCronTask` (18 tests), `NotificationService` (22 tests), `NotificationProcessor` (3 tests), and notification constants (4 tests)

- Recognition module (`RecognitionModule`, `RecognitionService`, `RecognitionController`) allowing supervisors, admins, and owners to give positive kudos to team and org members (see spec 0006)
- Predefined recognition categories (`TEAMWORK`, `INNOVATION`, `LEADERSHIP`, `CUSTOMER_FOCUS`, `GOING_ABOVE_AND_BEYOND`, `OTHER`) with custom category support for `OTHER`
- Public and private recognition visibility controls with paginated feed endpoints (`GET /recognition/feed`, `GET /recognition/my`)
- Complaint module (`ComplaintModule`, `ComplaintService`, `ComplaintController`) for multi tenant issue reporting, targeting specific team members, and role based visibility scoping (see spec 0006)
- Complaint lifecycle workflow (`OPEN` -> `IN_REVIEW` -> `RESOLVED` / `DISMISSED`) with targeted user in review transitions and administrative resolution note tracking
- Automated two hour late complaint detection cron job (`ComplaintCronTask`) running every 5 minutes and marking unattended complaints as `LATE`
- Complaint aggregated stats endpoint (`GET /complaint/stats`) returning status counts scoped to the caller's role and visibility
- Real time Socket.io event broadcasting for complaints (`complaint:created`, `complaint:statusChanged`, `complaint:deleted`, `complaint:late`) via `TaskGateway`
- Email notification integration dispatching automated alerts via Resend when complaints are submitted, transitioned, or overdue
- Unit test suites for `RecognitionService`, `RecognitionController`, `ComplaintService`, `ComplaintController`, and `ComplaintCronTask` with 62 passing tests
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
- Review module (`ReviewModule`, `ReviewService`, `ReviewController`) for structured 360 degree performance review cycles, peer nominations, and score calibration (see spec 0005)
- Prisma models `ReviewTemplate`, `ReviewCycle`, `PerformanceReview`, `PeerNomination`, and `CalibrationSession` with organization scoping, cascade deletes, and composite unique constraints
- `reviewScore` and `lastReviewCycleId` fields on the `Performance` model to store calibrated human review scores alongside automated task scores
- Review templates CRUD endpoints allowing administrators and owners to build reusable question sets with rating scale (1 to 5) and free text questions
- Review cycles lifecycle management supporting `DRAFT`, `ACTIVE`, `CALIBRATING`, and `COMPLETED` stages with transactional template snapshotting
- Automatic generation of 360 degree reviews (`SELF`, `MANAGER`, and `UPWARD`) upon cycle activation for all active organization members inside a database transaction
- Peer nominations workflow allowing members to nominate up to 3 peers per cycle, with single and bulk administrative approval endpoints that auto generate `PEER` reviews
- AI assisted draft generation endpoint (`POST /review/reviews/:id/draft`) powered by `LlmService` using the reviewee's task performance history and cycle questions
- Review submission endpoint (`POST /review/reviews/:id/submit`) with strict rating scale response validation, automated average score calculation, and duplicate submission prevention
- Aggregated feedback endpoint (`GET /review/review-cycles/:cycleId/my-feedback`) with caller anonymity masking reviewer identities from reviewees, and full review list for administrators
- Department level calibration sessions allowing facilitators to review raw scores, apply adjustments with required notes, and write final calibrated scores directly into the `Performance` model
- Daily cron jobs in `PerformanceCronTask` for automated overdue review detection at 6:00 AM and 48 hour deadline reminder notifications at 8:00 AM
- Socket.io gateway event broadcasting (`review:assigned`, `review:submitted`, `review:overdue`, `calibration:completed`) via `TaskGateway`
- Unit test suite for `ReviewService` (57 tests), `ReviewController` (29 tests), and `PerformanceCronTask` (15 tests) bringing the review and scheduler suite to 101 passing tests
- Frontend API documentation for Phase 7 in `docs/api/phase-7.md`

### Changed
- `TaskGateway` is no longer listed as a provider in `TaskModule` and `TargetModule`; it is now imported through `GatewayModule` to avoid duplicate Socket.io server instances
- `DepartmentService` internal formatting condensed (no behavioural change)
- `dispatchToMany` in `NotificationService` now delegates to `dispatchBulk` instead of issuing sequential `add` calls, reducing Redis round trips from N to 1

### Fixed
- Ternary condition in `RecognitionService.create` where `customCategory` was validated with `dto.customCategory === RecognitionCategory.OTHER` rather than `dto.category === RecognitionCategory.OTHER`, which previously caused custom categories to always be saved as null (see spec 0006)
- Access check for individual target progress logging where non assignees were granted access while assignees were blocked
- Route matching and error handling order in `findOne` where access checks executed before validating target existence
- Target creation validation rule that blocked assignees on team targets instead of restricting them on company targets only
- Filter parameter handling in `findAll` so search parameters combine with role scoping rules instead of overwriting them
- `RolesGuard` read `activeorganisationId` (lowercase, British spelling) from the session instead of `activeOrganizationId`, which meant the guard never received the organization ID from Better Auth's session and every role protected route would fail unless the `x-org-id` header was sent
- `reassignTeam` where clause used `organzationId` (missing letter "i"), so Prisma silently ignored the organization filter and the bulk update could match profiles across all organizations instead of only the active one
- Department controller route changed from `/department` to `/departments` (plural) to follow REST conventions and match the Phase 2 API documentation
- Department `findAll` endpoint changed from `GET /departments/all` to `GET /departments` to follow standard collection patterns
- User `getAll` endpoint changed from `GET /users/all` to `GET /users` to match the same convention
- Progress threshold in `handleTargetAtRiskDetection` compared a 0 to 1 ratio against 50 instead of 0.5, causing every target under 100% progress to be flagged as at risk. Corrected to `< 0.5`
