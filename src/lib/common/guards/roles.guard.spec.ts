import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles/roles.decorator';

const mockPrisma = {
    member: {
        findFirst: jest.fn(),
    },
};

const mockReflector = {
    getAllAndOverride: jest.fn(),
};

/**
 * Creates a fake ExecutionContext with the given request properties.
 */
function createMockContext(overrides: {
    userId?: string;
    activeOrganizationId?: string;
    headers?: Record<string, string>;
}): ExecutionContext {
    const request = {
        user: overrides.userId ? { id: overrides.userId } : undefined,
        session: overrides.activeOrganizationId
            ? { activeOrganizationId: overrides.activeOrganizationId }
            : undefined,
        headers: overrides.headers ?? {},
    };
    return {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => ({}),
        getClass: () => ({}),
    } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
    let guard: RolesGuard;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RolesGuard,
                { provide: Reflector, useValue: mockReflector },
                { provide: PrismaService, useValue: mockPrisma },
            ],
        }).compile();

        guard = module.get<RolesGuard>(RolesGuard);
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(guard).toBeDefined();
    });

    // ── No @Roles() decorator ────────────────────────────────

    describe('when no @Roles() decorator is present', () => {
        it('allows any authenticated user through', async () => {
            mockReflector.getAllAndOverride.mockReturnValue(undefined);

            const context = createMockContext({ userId: 'u1', activeOrganizationId: 'org-1' });
            const result = await guard.canActivate(context);

            expect(result).toBe(true);
            expect(mockPrisma.member.findFirst).not.toHaveBeenCalled();
        });

        it('allows through when roles array is empty', async () => {
            mockReflector.getAllAndOverride.mockReturnValue([]);

            const context = createMockContext({ userId: 'u1', activeOrganizationId: 'org-1' });
            const result = await guard.canActivate(context);

            expect(result).toBe(true);
        });
    });

    // ── Missing session data ─────────────────────────────────

    describe('when session data is missing', () => {
        it('throws ForbiddenException when userId is missing', async () => {
            mockReflector.getAllAndOverride.mockReturnValue(['admin']);

            const context = createMockContext({ activeOrganizationId: 'org-1' });

            await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
        });

        it('throws ForbiddenException when orgId is missing', async () => {
            mockReflector.getAllAndOverride.mockReturnValue(['admin']);

            const context = createMockContext({ userId: 'u1' });

            await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
        });
    });

    // ── Role checking ────────────────────────────────────────

    describe('role authorization', () => {
        beforeEach(() => {
            mockReflector.getAllAndOverride.mockReturnValue(['owner', 'admin']);
        });

        it('allows a user whose role is in the required list', async () => {
            mockPrisma.member.findFirst.mockResolvedValue({ role: 'admin' });

            const context = createMockContext({ userId: 'u1', activeOrganizationId: 'org-1' });
            const result = await guard.canActivate(context);

            expect(result).toBe(true);
        });

        it('throws ForbiddenException when user role is not in the required list', async () => {
            mockPrisma.member.findFirst.mockResolvedValue({ role: 'member' });

            const context = createMockContext({ userId: 'u1', activeOrganizationId: 'org-1' });

            await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
        });

        it('throws ForbiddenException when user is not a member of the org', async () => {
            mockPrisma.member.findFirst.mockResolvedValue(null);

            const context = createMockContext({ userId: 'u1', activeOrganizationId: 'org-1' });

            await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
        });
    });

    // ── x-org-id header fallback ─────────────────────────────

    describe('x-org-id header fallback', () => {
        it('uses x-org-id header when session has no activeOrganizationId', async () => {
            mockReflector.getAllAndOverride.mockReturnValue(['admin']);
            mockPrisma.member.findFirst.mockResolvedValue({ role: 'admin' });

            const context = createMockContext({
                userId: 'u1',
                headers: { 'x-org-id': 'org-from-header' },
            });
            const result = await guard.canActivate(context);

            expect(result).toBe(true);
            expect(mockPrisma.member.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { userId: 'u1', organizationId: 'org-from-header' },
                }),
            );
        });
    });
});
