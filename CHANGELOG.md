# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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

### Fixed
- `RolesGuard` read `activeorganisationId` (lowercase, British spelling) from the session instead of `activeOrganizationId`, which meant the guard never received the organization ID from Better Auth's session and every role protected route would fail unless the `x-org-id` header was sent
- `reassignTeam` where clause used `organzationId` (missing letter "i"), so Prisma silently ignored the organization filter and the bulk update could match profiles across all organizations instead of only the active one
- Department controller route changed from `/department` to `/departments` (plural) to follow REST conventions and match the Phase 2 API documentation
- Department `findAll` endpoint changed from `GET /departments/all` to `GET /departments` to follow standard collection patterns
- User `getAll` endpoint changed from `GET /users/all` to `GET /users` to match the same convention
