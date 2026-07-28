import { ForbiddenException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly prisma: PrismaService
    ) { }
    async canActivate(context: ExecutionContext,): Promise<boolean> {
        const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!requiredRoles || requiredRoles.length === 0) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const userId: string | undefined = request.user?.id;
        const orgId: string | undefined = request.session?.activeOrganizationId ?? request.headers?.['x-org-id'];

        if (!userId || !orgId) {
            throw new ForbiddenException("No active organization. Call organization.setActive() first");
        }

        const membership = await this.prisma.member.findFirst({
            where: { userId, organizationId: orgId },
            select: { role: true }
        })

        request._currentRole = membership?.role ?? null;

        if (!membership) {
            throw new ForbiddenException("You are not a member of this organization");
        }

        if (!requiredRoles.includes(membership.role)) {
            throw new ForbiddenException(`Access denied. Required roles: ${requiredRoles.join(', ')}, Your role is ${membership.role}`);
        }

        return true;
    }
}
