import { Test, TestingModule } from '@nestjs/testing';
import { DepartmentService } from './department.service';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { AuditLogService } from '../../lib/audit/audit.service';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

const mockPrisma = {
    department: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
    member: {
        findFirst: jest.fn(),
    },
    user: {
        findUnique: jest.fn(),
    },
};

describe('DepartmentService', () => {
    let service: DepartmentService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DepartmentService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: AuditLogService, useValue: { log: jest.fn() } },
            ],
        }).compile();

        service = module.get<DepartmentService>(DepartmentService);
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // ── create ────────────────────────────────────────────────

    describe('create', () => {
        const orgId = 'org-1';
        const dto = { name: 'Engineering', description: 'Eng team' };

        it('creates a department when name is unique in the org', async () => {
            mockPrisma.department.findUnique.mockResolvedValue(null);
            mockPrisma.department.create.mockResolvedValue({
                id: 'dept-1',
                organizationId: orgId,
                ...dto,
                headId: null,
                staff: [],
            });

            const result = await service.create(orgId, dto);

            expect(result.name).toBe('Engineering');
            expect(mockPrisma.department.findUnique).toHaveBeenCalledWith({
                where: { organizationId_name: { organizationId: orgId, name: dto.name } },
            });
        });

        it('throws ConflictException when a department with the same name already exists', async () => {
            mockPrisma.department.findUnique.mockResolvedValue({ id: 'existing' });

            await expect(service.create(orgId, dto)).rejects.toThrow(ConflictException);
        });

        it('validates headId is an org member before creating', async () => {
            const dtoWithHead = { ...dto, headId: 'user-99' };
            mockPrisma.department.findUnique.mockResolvedValue(null);
            mockPrisma.member.findFirst.mockResolvedValue(null);

            await expect(service.create(orgId, dtoWithHead)).rejects.toThrow(BadRequestException);
            expect(mockPrisma.member.findFirst).toHaveBeenCalledWith({
                where: { organizationId: orgId, userId: 'user-99' },
            });
        });

        it('skips headId validation when headId is not provided', async () => {
            mockPrisma.department.findUnique.mockResolvedValue(null);
            mockPrisma.department.create.mockResolvedValue({
                id: 'dept-1',
                organizationId: orgId,
                ...dto,
                headId: null,
                staff: [],
            });

            await service.create(orgId, dto);

            expect(mockPrisma.member.findFirst).not.toHaveBeenCalled();
        });
    });

    // ── findAll ───────────────────────────────────────────────

    describe('findAll', () => {
        it('returns departments enriched with head info and staff counts', async () => {
            mockPrisma.department.findMany.mockResolvedValue([
                {
                    id: 'dept-1',
                    name: 'Engineering',
                    organizationId: 'org-1',
                    headId: 'user-head',
                    staff: [
                        { status: 'active', user: { id: 'u1', name: 'Alice', email: 'a@a.com', image: null } },
                        { status: 'inactive', user: { id: 'u2', name: 'Bob', email: 'b@b.com', image: null } },
                    ],
                    _count: { staff: 2 },
                },
            ]);
            mockPrisma.user.findUnique.mockResolvedValue({
                id: 'user-head',
                name: 'Head',
                email: 'head@a.com',
                image: null,
            });

            const result = await service.findAll('org-1');

            expect(result).toHaveLength(1);
            expect(result[0].staffCount).toBe(2);
            expect(result[0].activeStaffCount).toBe(1);
            expect(result[0].head).toEqual(expect.objectContaining({ id: 'user-head' }));
        });

        it('sets head to null when headId is not set', async () => {
            mockPrisma.department.findMany.mockResolvedValue([
                {
                    id: 'dept-2',
                    name: 'Sales',
                    organizationId: 'org-1',
                    headId: null,
                    staff: [],
                    _count: { staff: 0 },
                },
            ]);

            const result = await service.findAll('org-1');

            expect(result[0].head).toBeNull();
            expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
        });

        it('returns empty array when org has no departments', async () => {
            mockPrisma.department.findMany.mockResolvedValue([]);

            const result = await service.findAll('org-1');

            expect(result).toEqual([]);
        });
    });

    // ── findOne ───────────────────────────────────────────────

    describe('findOne', () => {
        it('returns a department with head info and staff count', async () => {
            mockPrisma.department.findUnique.mockResolvedValue({
                id: 'dept-1',
                name: 'Engineering',
                organizationId: 'org-1',
                headId: 'user-head',
                staff: [{ status: 'active', user: { id: 'u1' } }],
            });
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-head', name: 'Head' });

            const result = await service.findOne('org-1', 'dept-1');

            expect(result.staffCount).toBe(1);
            expect(result.head).toEqual(expect.objectContaining({ id: 'user-head' }));
        });

        it('throws NotFoundException when department does not exist', async () => {
            mockPrisma.department.findUnique.mockResolvedValue(null);

            await expect(service.findOne('org-1', 'nonexistent')).rejects.toThrow(NotFoundException);
        });
    });

    // ── update ────────────────────────────────────────────────

    describe('update', () => {
        it('updates a department when the new name is unique', async () => {
            mockPrisma.department.findUnique
                .mockResolvedValueOnce({ id: 'dept-1', name: 'Old Name', organizationId: 'org-1' })
                .mockResolvedValueOnce(null); // no duplicate name
            mockPrisma.department.update.mockResolvedValue({
                id: 'dept-1',
                name: 'New Name',
                staff: [],
            });

            const result = await service.update('org-1', 'dept-1', { name: 'New Name' });

            expect(result.name).toBe('New Name');
        });

        it('throws NotFoundException when updating a department that does not exist', async () => {
            mockPrisma.department.findUnique.mockResolvedValue(null);

            await expect(
                service.update('org-1', 'nonexistent', { name: 'X' }),
            ).rejects.toThrow(NotFoundException);
        });

        it('throws ConflictException when renaming to an already taken name', async () => {
            mockPrisma.department.findUnique
                .mockResolvedValueOnce({ id: 'dept-1', name: 'Old', organizationId: 'org-1' })
                .mockResolvedValueOnce({ id: 'dept-2', name: 'Taken' }); // duplicate exists

            await expect(
                service.update('org-1', 'dept-1', { name: 'Taken' }),
            ).rejects.toThrow(ConflictException);
        });

        it('skips name uniqueness check when name is not changing', async () => {
            mockPrisma.department.findUnique.mockResolvedValueOnce({
                id: 'dept-1',
                name: 'Same',
                organizationId: 'org-1',
            });
            mockPrisma.department.update.mockResolvedValue({ id: 'dept-1', name: 'Same', staff: [] });

            await service.update('org-1', 'dept-1', { description: 'updated desc' });

            // findUnique called only once (for the dept lookup), not a second time for name check
            expect(mockPrisma.department.findUnique).toHaveBeenCalledTimes(1);
        });
    });

    // ── remove ────────────────────────────────────────────────

    describe('remove', () => {
        it('deletes a department when it has no staff', async () => {
            mockPrisma.department.findFirst.mockResolvedValue({
                id: 'dept-1',
                organizationId: 'org-1',
                _count: { staff: 0 },
            });
            mockPrisma.department.delete.mockResolvedValue({ id: 'dept-1' });

            const result = await service.remove('org-1', 'dept-1');

            expect(mockPrisma.department.delete).toHaveBeenCalledWith({ where: { id: 'dept-1' } });
        });

        it('throws NotFoundException when department does not exist', async () => {
            mockPrisma.department.findFirst.mockResolvedValue(null);

            await expect(service.remove('org-1', 'nonexistent')).rejects.toThrow(NotFoundException);
        });

        it('throws BadRequestException when department still has staff assigned', async () => {
            mockPrisma.department.findFirst.mockResolvedValue({
                id: 'dept-1',
                organizationId: 'org-1',
                _count: { staff: 3 },
            });

            await expect(service.remove('org-1', 'dept-1')).rejects.toThrow(BadRequestException);
            expect(mockPrisma.department.delete).not.toHaveBeenCalled();
        });
    });
});
