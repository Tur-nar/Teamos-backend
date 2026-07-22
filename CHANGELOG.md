# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
