import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

const mockPrisma = {
    user: {
        findUnique: jest.fn(),
    },
    userProfile: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
    },
    member: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
    },
    department: {
        findFirst: jest.fn(),
    },
};

describe('UserService', () => {
    let service: UserService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UserService,
                { provide: PrismaService, useValue: mockPrisma },
            ],
        }).compile();

        service = module.get<UserService>(UserService);
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // ── getAllProfile ─────────────────────────────────────────

    describe('getAllProfile', () => {
        it('returns user with all org memberships', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({
                id: 'user-1',
                name: 'Alice',
                email: 'alice@test.com',
                members: [
                    { id: 'm1', role: 'admin', organizationId: 'org-1', organization: { id: 'org-1', name: 'Org A' } },
                    { id: 'm2', role: 'member', organizationId: 'org-2', organization: { id: 'org-2', name: 'Org B' } },
                ],
            });

            const result = await service.getAllProfile('user-1');

            expect(result.members).toHaveLength(2);
            expect(result.id).toBe('user-1');
        });

        it('throws NotFoundException when user does not exist', async () => {
            mockPrisma.user.findUnique.mockResolvedValue(null);

            await expect(service.getAllProfile('nonexistent')).rejects.toThrow(NotFoundException);
        });
    });

    // ── getProfile ───────────────────────────────────────────

    describe('getProfile', () => {
        it('returns user with org scoped profile and active role', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({
                id: 'user-1',
                name: 'Alice',
                members: [
                    { id: 'm1', role: 'admin', organizationId: 'org-1', organization: { id: 'org-1' } },
                ],
            });
            mockPrisma.userProfile.findUnique.mockResolvedValue({
                departmentId: 'dept-1',
                supervisorId: null,
                status: 'active',
                department: { id: 'dept-1', name: 'Engineering' },
            });

            const result = await service.getProfile('user-1', 'org-1');

            expect(result.activeRole).toBe('admin');
            expect(result.profile).toEqual(
                expect.objectContaining({ departmentId: 'dept-1' }),
            );
        });

        it('returns null profile when user has no profile in the active org', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({
                id: 'user-1',
                name: 'Alice',
                members: [{ id: 'm1', role: 'member', organizationId: 'org-1' }],
            });
            mockPrisma.userProfile.findUnique.mockResolvedValue(null);

            const result = await service.getProfile('user-1', 'org-1');

            expect(result.profile).toBeNull();
        });

        it('returns null activeRole when user is not a member of the requested org', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({
                id: 'user-1',
                name: 'Alice',
                members: [{ id: 'm1', role: 'admin', organizationId: 'org-other' }],
            });
            mockPrisma.userProfile.findUnique.mockResolvedValue(null);

            const result = await service.getProfile('user-1', 'org-1');

            expect(result.activeRole).toBeNull();
        });

        it('throws NotFoundException when user does not exist', async () => {
            mockPrisma.user.findUnique.mockResolvedValue(null);

            await expect(service.getProfile('nonexistent', 'org-1')).rejects.toThrow(NotFoundException);
        });
    });

    // ── findAllMembersOfOrganization ─────────────────────────

    describe('findAllMembersOfOrganization', () => {
        it('returns members joined with their org scoped profiles', async () => {
            mockPrisma.userProfile.findMany.mockResolvedValue([
                {
                    userId: 'u1',
                    departmentId: 'dept-1',
                    supervisorId: null,
                    status: 'active',
                    department: { id: 'dept-1', name: 'Eng' },
                    user: { id: 'u1', name: 'Alice', email: 'a@a.com', image: null },
                },
            ]);
            mockPrisma.member.findMany.mockResolvedValue([
                {
                    id: 'm1',
                    userId: 'u1',
                    role: 'admin',
                    user: { id: 'u1', name: 'Alice', email: 'a@a.com', image: null },
                },
            ]);

            const result = await service.findAllMembersOfOrganization('org-1');

            expect(result).toHaveLength(1);
            expect(result[0].role).toBe('admin');
            expect(result[0].profile).toEqual(
                expect.objectContaining({ status: 'active', supervisorId: null }),
            );
        });

        it('returns null profile for members who have no UserProfile yet', async () => {
            mockPrisma.userProfile.findMany.mockResolvedValue([]);
            mockPrisma.member.findMany.mockResolvedValue([
                {
                    id: 'm1',
                    userId: 'u-new',
                    role: 'member',
                    user: { id: 'u-new', name: 'Newbie' },
                },
            ]);

            const result = await service.findAllMembersOfOrganization('org-1');

            expect(result).toHaveLength(1);
            expect(result[0].profile).toBeNull();
        });

        it('filters by role when role filter is provided', async () => {
            mockPrisma.userProfile.findMany.mockResolvedValue([]);
            mockPrisma.member.findMany.mockResolvedValue([]);

            await service.findAllMembersOfOrganization('org-1', { role: 'supervisor' });

            expect(mockPrisma.member.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ role: 'supervisor' }),
                }),
            );
        });

        it('filters out members without profiles when departmentId filter is set', async () => {
            mockPrisma.userProfile.findMany.mockResolvedValue([
                {
                    userId: 'u1',
                    departmentId: 'dept-1',
                    supervisorId: null,
                    status: 'active',
                    department: { id: 'dept-1', name: 'Eng' },
                    user: { id: 'u1', name: 'Alice' },
                },
            ]);
            mockPrisma.member.findMany.mockResolvedValue([
                { id: 'm1', userId: 'u1', role: 'admin', user: { id: 'u1' } },
                { id: 'm2', userId: 'u2', role: 'member', user: { id: 'u2' } },
            ]);

            const result = await service.findAllMembersOfOrganization('org-1', {
                departmentId: 'dept-1',
            });

            // u2 has no profile in the profileMap, so is filtered out
            expect(result).toHaveLength(1);
            expect(result[0].user.id).toBe('u1');
        });
    });

    // ── findSupervisors ──────────────────────────────────────

    describe('findSupervisors', () => {
        it('returns supervisors with their team members', async () => {
            mockPrisma.member.findMany.mockResolvedValue([
                { userId: 'sup-1', role: 'supervisor', user: { id: 'sup-1', name: 'Supervisor' } },
            ]);
            mockPrisma.userProfile.findMany
                // First call: supervisor profiles
                .mockResolvedValueOnce([
                    { userId: 'sup-1', department: { id: 'dept-1', name: 'Eng' } },
                ])
                // Second call: team profiles
                .mockResolvedValueOnce([
                    { supervisorId: 'sup-1', user: { id: 'u1', name: 'Alice' }, status: 'active', departmentId: 'dept-1' },
                    { supervisorId: 'sup-1', user: { id: 'u2', name: 'Bob' }, status: 'active', departmentId: 'dept-1' },
                ]);

            const result = await service.findSupervisors('org-1');

            expect(result).toHaveLength(1);
            expect(result[0].teamSize).toBe(2);
            expect(result[0].department).toEqual({ id: 'dept-1', name: 'Eng' });
        });

        it('returns empty team when supervisor has no assigned members', async () => {
            mockPrisma.member.findMany.mockResolvedValue([
                { userId: 'sup-1', role: 'supervisor', user: { id: 'sup-1', name: 'Supervisor' } },
            ]);
            mockPrisma.userProfile.findMany
                .mockResolvedValueOnce([{ userId: 'sup-1', department: null }])
                .mockResolvedValueOnce([]);

            const result = await service.findSupervisors('org-1');

            expect(result[0].teamSize).toBe(0);
            expect(result[0].team).toEqual([]);
        });
    });

    // ── getTeam ──────────────────────────────────────────────

    describe('getTeam', () => {
        it('returns team members for a valid supervisor', async () => {
            mockPrisma.member.findFirst.mockResolvedValue({ userId: 'sup-1' });
            mockPrisma.userProfile.findMany.mockResolvedValue([
                {
                    user: { id: 'u1', name: 'Alice', email: 'a@a.com', image: null },
                    status: 'active',
                    department: { id: 'dept-1', name: 'Eng' },
                },
            ]);

            const result = await service.getTeam('org-1', 'sup-1');

            expect(result).toHaveLength(1);
            expect(result[0].status).toBe('active');
        });

        it('throws NotFoundException when supervisor is not in the org', async () => {
            mockPrisma.member.findFirst.mockResolvedValue(null);

            await expect(service.getTeam('org-1', 'not-a-member')).rejects.toThrow(NotFoundException);
        });
    });

    // ── updateProfile ────────────────────────────────────────

    describe('updateProfile', () => {
        it('upserts a profile for a valid org member', async () => {
            mockPrisma.member.findFirst.mockResolvedValue({ userId: 'u1' });
            mockPrisma.department.findFirst.mockResolvedValue({ id: 'dept-1', organizationId: 'org-1' });
            mockPrisma.userProfile.upsert.mockResolvedValue({
                userId: 'u1',
                departmentId: 'dept-1',
                user: { id: 'u1', name: 'Alice' },
                department: { id: 'dept-1', name: 'Eng' },
            });

            const result = await service.updateProfile('org-1', 'u1', {
                departmentId: 'dept-1',
            });

            expect(mockPrisma.userProfile.upsert).toHaveBeenCalled();
            expect(result.departmentId).toBe('dept-1');
        });

        it('throws NotFoundException when target user is not in the org', async () => {
            mockPrisma.member.findFirst.mockResolvedValue(null);

            await expect(
                service.updateProfile('org-1', 'stranger', { status: 'active' as any }),
            ).rejects.toThrow(NotFoundException);
        });

        it('throws BadRequestException when departmentId does not belong to the org', async () => {
            mockPrisma.member.findFirst.mockResolvedValue({ userId: 'u1' });
            mockPrisma.department.findFirst.mockResolvedValue(null);

            await expect(
                service.updateProfile('org-1', 'u1', { departmentId: 'fake-dept' }),
            ).rejects.toThrow(BadRequestException);
        });

        it('throws BadRequestException when supervisorId does not have supervisor role', async () => {
            mockPrisma.member.findFirst
                .mockResolvedValueOnce({ userId: 'u1' }) // target user membership
                .mockResolvedValueOnce(null); // supervisor membership lookup fails

            await expect(
                service.updateProfile('org-1', 'u1', { supervisorId: 'not-a-supervisor' }),
            ).rejects.toThrow(BadRequestException);
        });
    });

    // ── reassignTeam ─────────────────────────────────────────

    describe('reassignTeam', () => {
        it('reassigns all team members from one supervisor to another', async () => {
            mockPrisma.member.findFirst
                .mockResolvedValueOnce({ userId: 'sup-1' }) // current
                .mockResolvedValueOnce({ userId: 'sup-2' }); // target
            mockPrisma.userProfile.count.mockResolvedValue(3);
            mockPrisma.userProfile.updateMany.mockResolvedValue({ count: 3 });

            const result = await service.reassignTeam('org-1', 'sup-1', {
                targetSupervisorId: 'sup-2',
            });

            expect(result.reassignedCount).toBe(3);
        });

        it('reassigns only specified members when memberIds are provided', async () => {
            mockPrisma.member.findFirst
                .mockResolvedValueOnce({ userId: 'sup-1' })
                .mockResolvedValueOnce({ userId: 'sup-2' });
            mockPrisma.userProfile.count.mockResolvedValue(2);
            mockPrisma.userProfile.updateMany.mockResolvedValue({ count: 2 });

            const result = await service.reassignTeam('org-1', 'sup-1', {
                targetSupervisorId: 'sup-2',
                memberIds: ['u1', 'u2'],
            });

            expect(result.reassignedCount).toBe(2);
        });

        it('throws NotFoundException when current supervisor does not exist', async () => {
            mockPrisma.member.findFirst
                .mockResolvedValueOnce(null) // current not found
                .mockResolvedValueOnce({ userId: 'sup-2' });

            await expect(
                service.reassignTeam('org-1', 'nonexistent', { targetSupervisorId: 'sup-2' }),
            ).rejects.toThrow(NotFoundException);
        });

        it('throws NotFoundException when target supervisor does not exist', async () => {
            mockPrisma.member.findFirst
                .mockResolvedValueOnce({ userId: 'sup-1' }) // current OK
                .mockResolvedValueOnce(null); // target not found

            await expect(
                service.reassignTeam('org-1', 'sup-1', { targetSupervisorId: 'nonexistent' }),
            ).rejects.toThrow(NotFoundException);
        });

        it('throws BadRequestException when no team members match the criteria', async () => {
            mockPrisma.member.findFirst
                .mockResolvedValueOnce({ userId: 'sup-1' })
                .mockResolvedValueOnce({ userId: 'sup-2' });
            mockPrisma.userProfile.count.mockResolvedValue(0);

            await expect(
                service.reassignTeam('org-1', 'sup-1', { targetSupervisorId: 'sup-2' }),
            ).rejects.toThrow(BadRequestException);
        });
    });
});
