import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';

/**
 * Extracts the active organization ID from the Better Auth session.
 *
 * Usage:
 * ```ts
 * @Get('tasks')
 * findAll(@CurrentOrg() orgId: string) {
 *     return this.taskService.findAll(orgId);
 * }
 * ```
 *
 * The active organization is set client-side via Better Auth's
 * `organization.setActive()` and is stored on the session.
 *
 * Falls back to the `x-org-id` header if the session doesn't carry
 * the active org (useful for API-key-based integrations later).
 */
export const CurrentOrg = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): string => {
        const request = ctx.switchToHttp().getRequest();

        // Better Auth stores the active organization on the session object
        const orgId: string | undefined =
            request.session?.activeOrganizationId ??
            request.headers?.['x-org-id'];

        if (!orgId) {
            throw new BadRequestException(
                'No active organization. Call organization.setActive() first.',
            );
        }

        return orgId;
    },
);
