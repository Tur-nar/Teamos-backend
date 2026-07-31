import { Test, TestingModule } from '@nestjs/testing';
import { TargetService } from './target.service';
import { PrismaService } from 'src/lib/prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { TaskGateway } from '../../gateway/task.gateway';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

// ── Helpers ──

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';
const DEPT_ID = 'dept-1';
const OTHER_DEPT_ID = 'dept-2';
const TARGET_ID = 'target-1';
const PARENT_TARGET_ID = 'parent-target-1';
const ENTRY_ID = 'entry-1';

function makeTarget(overrides: Record<string, any> = {}) {
  return {
    id: TARGET_ID,
    organizationId: ORG_ID,
    title: 'Revenue Target',
    description: null,
    type: 'COMPANY',
    parentTargetId: null,
    targetValue: 100,
    currentValue: 0,
    status: 'ON_TRACK',
    period: 'Q3 2026',
    deadline: new Date('2026-09-30'),
    assignedToId: null,
    createdById: USER_ID,
    departmentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeTargetWithIncludes(overrides: Record<string, any> = {}) {
  return {
    ...makeTarget(overrides),
    department: null,
    assignedTo: null,
    parent: null,
    ...(overrides.department !== undefined && { department: overrides.department }),
    ...(overrides.assignedTo !== undefined && { assignedTo: overrides.assignedTo }),
    ...(overrides.parent !== undefined && { parent: overrides.parent }),
  };
}

// ── Mock factories ──

function createMockPrisma() {
  const txProxy = {
    targetEntry: {
      create: jest.fn(),
      aggregate: jest.fn().mockResolvedValue({ _sum: { value: 0 } }),
      delete: jest.fn(),
    },
    target: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  return {
    target: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      delete: jest.fn(),
    },
    targetEntry: {
      findUnique: jest.fn(),
      aggregate: jest.fn().mockResolvedValue({ _sum: { value: 0 } }),
    },
    member: {
      findFirst: jest.fn(),
    },
    department: {
      findFirst: jest.fn(),
    },
    userProfile: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn((fn) => fn(txProxy)),
    _txProxy: txProxy,
  };
}

function createMockUpload() {
  return {
    uploadTargetEntryAttachment: jest.fn().mockResolvedValue({
      url: 'https://cloudinary.com/file.pdf',
      fileName: 'file.pdf',
      fileSize: 1024,
    }),
    deleteFile: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockGateway() {
  return {
    emitTargetCreated: jest.fn(),
    emitTargetUpdated: jest.fn(),
    emitTargetDeleted: jest.fn(),
    emitTargetEntryAdded: jest.fn(),
    emitTargetEntryDeleted: jest.fn(),
  };
}

describe('TargetService', () => {
  let service: TargetService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let upload: ReturnType<typeof createMockUpload>;
  let gateway: ReturnType<typeof createMockGateway>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    upload = createMockUpload();
    gateway = createMockGateway();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TargetService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: upload },
        { provide: TaskGateway, useValue: gateway },
      ],
    }).compile();

    service = module.get<TargetService>(TargetService);
  });

  // ──────────────────────────────────────────
  //  create()  → AC-1, AC-2, AC-5, AC-11
  // ──────────────────────────────────────────

  describe('create()', () => {
    const baseDto = {
      title: 'Revenue Target',
      type: 'COMPANY',
      targetValue: 100,
      deadline: '2026-09-30',
      period: 'Q3 2026',
    };

    it('creates a company target when caller is admin (AC-1, AC-5)', async () => {
      const created = makeTargetWithIncludes();
      prisma.target.create.mockResolvedValue(created);

      const result = await service.create(ORG_ID, USER_ID, 'admin', baseDto as any);

      expect(result).toEqual(created);
      expect(prisma.target.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: ORG_ID,
            type: 'COMPANY',
            title: 'Revenue Target',
          }),
        }),
      );
      expect(gateway.emitTargetCreated).toHaveBeenCalledWith(ORG_ID, created);
    });

    // AC-5: supervisor cannot create COMPANY
    it('throws ForbiddenException when supervisor tries to create a COMPANY target', async () => {
      await expect(
        service.create(ORG_ID, USER_ID, 'supervisor', baseDto as any),
      ).rejects.toThrow(ForbiddenException);
    });

    // AC-5: member cannot create any target
    it('throws ForbiddenException when member tries to create a TEAM target', async () => {
      await expect(
        service.create(ORG_ID, USER_ID, 'member', { ...baseDto, type: 'TEAM' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when member tries to create an INDIVIDUAL target', async () => {
      await expect(
        service.create(ORG_ID, USER_ID, 'member', { ...baseDto, type: 'INDIVIDUAL', assignedToId: OTHER_USER_ID } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    // AC-11: INDIVIDUAL requires assignedToId
    it('throws BadRequestException when INDIVIDUAL target has no assignedToId (AC-11)', async () => {
      await expect(
        service.create(ORG_ID, USER_ID, 'admin', { ...baseDto, type: 'INDIVIDUAL' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    // AC-11: COMPANY cannot have assignee
    it('throws BadRequestException when COMPANY target has an assignee (AC-11)', async () => {
      await expect(
        service.create(ORG_ID, USER_ID, 'admin', { ...baseDto, type: 'COMPANY', assignedToId: OTHER_USER_ID } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('validates assignee membership before creating', async () => {
      prisma.member.findFirst.mockResolvedValue(null);

      await expect(
        service.create(ORG_ID, USER_ID, 'admin', {
          ...baseDto, type: 'INDIVIDUAL', assignedToId: 'non-member',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('validates department exists before creating', async () => {
      prisma.member.findFirst.mockResolvedValue({ userId: OTHER_USER_ID, role: 'member' });
      prisma.department.findFirst.mockResolvedValue(null);

      await expect(
        service.create(ORG_ID, USER_ID, 'admin', {
          ...baseDto, type: 'INDIVIDUAL', assignedToId: OTHER_USER_ID, departmentId: 'bad-dept',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    // AC-5: supervisor can only create for own department
    it('throws ForbiddenException when supervisor creates for another department', async () => {
      prisma.member.findFirst.mockResolvedValue({ userId: OTHER_USER_ID, role: 'member' });
      prisma.department.findFirst.mockResolvedValue({ id: OTHER_DEPT_ID });
      prisma.userProfile.findUnique.mockResolvedValue({ departmentId: DEPT_ID });

      await expect(
        service.create(ORG_ID, USER_ID, 'supervisor', {
          ...baseDto, type: 'TEAM', departmentId: OTHER_DEPT_ID,
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    // AC-2: validates alignment when parentTargetId is provided
    it('validates alignment when parentTargetId is given (AC-2)', async () => {
      const companyTarget = makeTarget({ id: PARENT_TARGET_ID, type: 'COMPANY' });
      prisma.target.findUnique.mockResolvedValue(companyTarget);
      prisma.target.create.mockResolvedValue(makeTargetWithIncludes({ type: 'TEAM', parentTargetId: PARENT_TARGET_ID }));

      const result = await service.create(ORG_ID, USER_ID, 'admin', {
        ...baseDto, type: 'TEAM', parentTargetId: PARENT_TARGET_ID,
      } as any);

      expect(result.parentTargetId).toBe(PARENT_TARGET_ID);
    });
  });

  // ──────────────────────────────────────────
  //  findAll()  → AC-6
  // ──────────────────────────────────────────

  describe('findAll()', () => {
    it('throws ForbiddenException when user is not a member', async () => {
      prisma.member.findFirst.mockResolvedValue(null);

      await expect(
        service.findAll(ORG_ID, USER_ID, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    // AC-6: member scoping
    it('scopes member to own individual, department team, and all company targets (AC-6)', async () => {
      prisma.member.findFirst.mockResolvedValue({ role: 'member', userId: USER_ID });
      prisma.userProfile.findUnique.mockResolvedValue({ departmentId: DEPT_ID });
      prisma.target.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, USER_ID, {});

      const callArgs = prisma.target.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toEqual([
        { type: 'INDIVIDUAL', assignedToId: USER_ID },
        { type: 'TEAM', departmentId: DEPT_ID },
        { type: 'COMPANY' },
      ]);
    });

    // AC-6: supervisor scoping includes supervised users
    it('scopes supervisor to own team individual targets and department team targets (AC-6)', async () => {
      prisma.member.findFirst.mockResolvedValue({ role: 'supervisor', userId: USER_ID });
      prisma.userProfile.findUnique.mockResolvedValue({ departmentId: DEPT_ID });
      prisma.userProfile.findMany.mockResolvedValue([{ userId: OTHER_USER_ID }]);
      prisma.target.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, USER_ID, {});

      const callArgs = prisma.target.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toEqual([
        { type: 'INDIVIDUAL', assignedToId: { in: [OTHER_USER_ID, USER_ID] } },
        { type: 'TEAM', departmentId: DEPT_ID },
        { type: 'COMPANY' },
      ]);
    });

    // AC-6: admin sees all (no OR clause)
    it('does not scope admin or owner targets (AC-6)', async () => {
      prisma.member.findFirst.mockResolvedValue({ role: 'admin', userId: USER_ID });
      prisma.userProfile.findUnique.mockResolvedValue({ departmentId: DEPT_ID });
      prisma.target.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, USER_ID, {});

      const callArgs = prisma.target.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toBeUndefined();
    });

    it('applies filters to the query', async () => {
      prisma.member.findFirst.mockResolvedValue({ role: 'admin', userId: USER_ID });
      prisma.userProfile.findUnique.mockResolvedValue({ departmentId: DEPT_ID });
      prisma.target.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, USER_ID, { type: 'COMPANY', period: 'Q3 2026' });

      const callArgs = prisma.target.findMany.mock.calls[0][0];
      expect(callArgs.where.type).toBe('COMPANY');
      expect(callArgs.where.period).toBe('Q3 2026');
    });

    it('orders results by createdAt descending', async () => {
      prisma.member.findFirst.mockResolvedValue({ role: 'admin', userId: USER_ID });
      prisma.userProfile.findUnique.mockResolvedValue({ departmentId: DEPT_ID });
      prisma.target.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, USER_ID, {});

      const callArgs = prisma.target.findMany.mock.calls[0][0];
      expect(callArgs.orderBy).toEqual({ createdAt: 'desc' });
    });
  });

  // ──────────────────────────────────────────
  //  findOne()  → AC-6, security: null check
  // ──────────────────────────────────────────

  describe('findOne()', () => {
    it('returns the target with full includes when found', async () => {
      const target = {
        ...makeTarget({ type: 'COMPANY' }),
        department: null,
        assignedTo: null,
        createdBy: { id: USER_ID, name: 'Admin', email: 'a@a.com', image: null, members: [{ role: 'admin' }] },
        parent: null,
        children: [],
        entries: [],
      };
      prisma.target.findUnique.mockResolvedValue(target);

      const result = await service.findOne(ORG_ID, TARGET_ID, USER_ID, 'admin');
      expect(result).toEqual(target);
    });

    // Security: null check before access check
    it('throws BadRequestException when target does not exist', async () => {
      prisma.target.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne(ORG_ID, 'non-existent', USER_ID, 'member'),
      ).rejects.toThrow(BadRequestException);
    });

    // AC-6: member cannot view another users individual target
    it('throws ForbiddenException when member views another users individual target (AC-6)', async () => {
      const target = {
        ...makeTarget({ type: 'INDIVIDUAL', assignedToId: OTHER_USER_ID }),
        department: null, assignedTo: null, createdBy: null, parent: null, children: [], entries: [],
      };
      prisma.target.findUnique.mockResolvedValue(target);

      await expect(
        service.findOne(ORG_ID, TARGET_ID, USER_ID, 'member'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows member to view their own individual target', async () => {
      const target = {
        ...makeTarget({ type: 'INDIVIDUAL', assignedToId: USER_ID }),
        department: null, assignedTo: null, createdBy: null, parent: null, children: [], entries: [],
      };
      prisma.target.findUnique.mockResolvedValue(target);

      const result = await service.findOne(ORG_ID, TARGET_ID, USER_ID, 'member');
      expect(result.assignedToId).toBe(USER_ID);
    });

    // AC-6: member/supervisor cannot view team target from different department
    it('throws ForbiddenException when member views team target from another department', async () => {
      const target = {
        ...makeTarget({ type: 'TEAM', departmentId: OTHER_DEPT_ID }),
        department: null, assignedTo: null, createdBy: null, parent: null, children: [], entries: [],
      };
      prisma.target.findUnique.mockResolvedValue(target);
      prisma.userProfile.findUnique.mockResolvedValue({ departmentId: DEPT_ID });

      await expect(
        service.findOne(ORG_ID, TARGET_ID, USER_ID, 'member'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows member to view company targets regardless of department', async () => {
      const target = {
        ...makeTarget({ type: 'COMPANY' }),
        department: null, assignedTo: null, createdBy: null, parent: null, children: [], entries: [],
      };
      prisma.target.findUnique.mockResolvedValue(target);

      const result = await service.findOne(ORG_ID, TARGET_ID, USER_ID, 'member');
      expect(result.type).toBe('COMPANY');
    });
  });

  // ──────────────────────────────────────────
  //  update()
  // ──────────────────────────────────────────

  describe('update()', () => {
    it('updates when the caller is the creator', async () => {
      const target = { ...makeTarget(), createdBy: { id: USER_ID } };
      prisma.target.findFirst.mockResolvedValue(target);
      prisma.member.findFirst.mockResolvedValue({ role: 'admin' });
      const updated = makeTargetWithIncludes({ title: 'Updated' });
      prisma.target.update.mockResolvedValue(updated);

      const result = await service.update(ORG_ID, TARGET_ID, USER_ID, 'admin', { title: 'Updated' } as any);

      expect(result.title).toBe('Updated');
      expect(gateway.emitTargetUpdated).toHaveBeenCalledWith(ORG_ID, updated);
    });

    it('throws BadRequestException when target not found', async () => {
      prisma.target.findFirst.mockResolvedValue(null);

      await expect(
        service.update(ORG_ID, TARGET_ID, USER_ID, 'admin', {} as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when non creator with lower rank tries to update', async () => {
      const target = { ...makeTarget({ createdById: OTHER_USER_ID }), createdBy: { id: OTHER_USER_ID } };
      prisma.target.findFirst.mockResolvedValue(target);
      prisma.member.findFirst.mockResolvedValue({ role: 'admin' });

      await expect(
        service.update(ORG_ID, TARGET_ID, USER_ID, 'member', { title: 'Hacked' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows higher ranked user to update target they did not create', async () => {
      const target = { ...makeTarget({ createdById: OTHER_USER_ID }), createdBy: { id: OTHER_USER_ID } };
      prisma.target.findFirst.mockResolvedValue(target);
      prisma.member.findFirst.mockResolvedValue({ role: 'member' });
      prisma.target.update.mockResolvedValue(makeTargetWithIncludes({ title: 'Admin Updated' }));

      const result = await service.update(ORG_ID, TARGET_ID, USER_ID, 'admin', { title: 'Admin Updated' } as any);
      expect(result.title).toBe('Admin Updated');
    });

    it('uses !== undefined checks so falsy values can clear fields', async () => {
      const target = { ...makeTarget(), createdBy: { id: USER_ID } };
      prisma.target.findFirst.mockResolvedValue(target);
      prisma.member.findFirst.mockResolvedValue({ role: 'admin' });
      prisma.target.update.mockResolvedValue(makeTargetWithIncludes({ description: '' }));

      await service.update(ORG_ID, TARGET_ID, USER_ID, 'admin', { description: '' } as any);

      const updateCall = prisma.target.update.mock.calls[0][0];
      expect(updateCall.data).toHaveProperty('description', '');
    });
  });

  // ──────────────────────────────────────────
  //  remove()  → AC-8
  // ──────────────────────────────────────────

  describe('remove()', () => {
    it('deletes a target with no children', async () => {
      const target = {
        ...makeTarget(), createdBy: { id: USER_ID }, _count: { children: 0 },
      };
      prisma.target.findFirst.mockResolvedValue(target);
      prisma.member.findFirst.mockResolvedValue({ role: 'admin' });
      prisma.target.delete.mockResolvedValue(target);

      const result = await service.remove(ORG_ID, TARGET_ID, USER_ID, 'admin');

      expect(result).toEqual({ deleted: true });
      expect(gateway.emitTargetDeleted).toHaveBeenCalledWith(ORG_ID, TARGET_ID);
    });

    // AC-8: block deletion of parent with children
    it('throws BadRequestException when target has children (AC-8)', async () => {
      const target = {
        ...makeTarget(), createdBy: { id: USER_ID }, _count: { children: 3 },
      };
      prisma.target.findFirst.mockResolvedValue(target);

      await expect(
        service.remove(ORG_ID, TARGET_ID, USER_ID, 'admin'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when target not found', async () => {
      prisma.target.findFirst.mockResolvedValue(null);

      await expect(
        service.remove(ORG_ID, TARGET_ID, USER_ID, 'admin'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when lower rank non creator tries to delete', async () => {
      const target = {
        ...makeTarget({ createdById: OTHER_USER_ID }), createdBy: { id: OTHER_USER_ID }, _count: { children: 0 },
      };
      prisma.target.findFirst.mockResolvedValue(target);
      prisma.member.findFirst.mockResolvedValue({ role: 'admin' });

      await expect(
        service.remove(ORG_ID, TARGET_ID, USER_ID, 'member'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ──────────────────────────────────────────
  //  addEntry()  → AC-3, AC-7, AC-9, AC-12
  // ──────────────────────────────────────────

  describe('addEntry()', () => {
    const entryDto = { value: 10, note: 'Weekly progress' };

    beforeEach(() => {
      const individualTarget = makeTarget({
        type: 'INDIVIDUAL', assignedToId: USER_ID, departmentId: DEPT_ID,
      });
      prisma.target.findUnique.mockResolvedValue(individualTarget);

      prisma._txProxy.targetEntry.create.mockResolvedValue({
        id: ENTRY_ID, targetId: TARGET_ID, userId: USER_ID, value: 10, note: 'Weekly progress',
        user: { id: USER_ID, name: 'User', email: 'u@u.com', image: null, members: [{ role: 'member' }] },
      });
      prisma._txProxy.targetEntry.aggregate.mockResolvedValue({ _sum: { value: 10 } });
      prisma._txProxy.target.update.mockResolvedValue({});
    });

    // AC-3: creates entry and updates currentValue
    it('creates an entry and returns the new current value (AC-3)', async () => {
      const result = await service.addEntry(ORG_ID, TARGET_ID, USER_ID, 'member', entryDto as any);

      expect(result.entry).toBeDefined();
      expect(result.newCurrentValue).toBe(10);
      expect(gateway.emitTargetEntryAdded).toHaveBeenCalled();
    });

    // AC-7: rejects entries on completed targets
    it('throws BadRequestException when target is COMPLETED (AC-7)', async () => {
      prisma.target.findUnique.mockResolvedValue(
        makeTarget({ status: 'COMPLETED', type: 'INDIVIDUAL', assignedToId: USER_ID }),
      );

      await expect(
        service.addEntry(ORG_ID, TARGET_ID, USER_ID, 'member', entryDto as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when target is MISSED (AC-7)', async () => {
      prisma.target.findUnique.mockResolvedValue(
        makeTarget({ status: 'MISSED', type: 'INDIVIDUAL', assignedToId: USER_ID }),
      );

      await expect(
        service.addEntry(ORG_ID, TARGET_ID, USER_ID, 'member', entryDto as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when target not found', async () => {
      prisma.target.findUnique.mockResolvedValue(null);

      await expect(
        service.addEntry(ORG_ID, 'non-existent', USER_ID, 'member', entryDto as any),
      ).rejects.toThrow(BadRequestException);
    });

    // AC-9: attachment upload
    it('uploads attachment when file is provided (AC-9)', async () => {
      const mockFile = { buffer: Buffer.from('test'), originalname: 'report.pdf', mimetype: 'application/pdf', size: 1024 } as Express.Multer.File;

      await service.addEntry(ORG_ID, TARGET_ID, USER_ID, 'member', entryDto as any, mockFile);

      expect(upload.uploadTargetEntryAttachment).toHaveBeenCalledWith(mockFile, TARGET_ID);
      const createCall = prisma._txProxy.targetEntry.create.mock.calls[0][0];
      expect(createCall.data.attachmentUrl).toBe('https://cloudinary.com/file.pdf');
    });

    // AC-12: uses transaction
    it('wraps entry creation and rollup in a transaction (AC-12)', async () => {
      await service.addEntry(ORG_ID, TARGET_ID, USER_ID, 'member', entryDto as any);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    // AC-3: rollup to parent
    it('calls rollup when target has a parent (AC-3)', async () => {
      prisma.target.findUnique.mockResolvedValue(
        makeTarget({ type: 'INDIVIDUAL', assignedToId: USER_ID, parentTargetId: PARENT_TARGET_ID, departmentId: DEPT_ID }),
      );
      prisma._txProxy.target.findUnique.mockResolvedValue({
        id: PARENT_TARGET_ID, parentTargetId: null, targetValue: 100,
        children: [{ currentValue: 10, targetValue: 50 }],
      });
      prisma._txProxy.target.update.mockResolvedValue({});

      await service.addEntry(ORG_ID, TARGET_ID, USER_ID, 'member', entryDto as any);

      // The tx.target.update is called twice: once for the target itself, once for the parent rollup
      expect(prisma._txProxy.target.update).toHaveBeenCalledTimes(2);
    });

    // Security: access control for entry logging
    it('allows admin to log entry on any target type', async () => {
      prisma.target.findUnique.mockResolvedValue(makeTarget({ type: 'COMPANY' }));

      await expect(
        service.addEntry(ORG_ID, TARGET_ID, USER_ID, 'admin', entryDto as any),
      ).resolves.toBeDefined();
    });

    it('throws ForbiddenException when non admin logs on COMPANY target', async () => {
      prisma.target.findUnique.mockResolvedValue(makeTarget({ type: 'COMPANY' }));

      await expect(
        service.addEntry(ORG_ID, TARGET_ID, USER_ID, 'member', entryDto as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows assignee to log on their own INDIVIDUAL target', async () => {
      prisma.target.findUnique.mockResolvedValue(
        makeTarget({ type: 'INDIVIDUAL', assignedToId: USER_ID, departmentId: DEPT_ID }),
      );

      await expect(
        service.addEntry(ORG_ID, TARGET_ID, USER_ID, 'member', entryDto as any),
      ).resolves.toBeDefined();
    });

    it('throws ForbiddenException when member logs on another users INDIVIDUAL target', async () => {
      prisma.target.findUnique.mockResolvedValue(
        makeTarget({ type: 'INDIVIDUAL', assignedToId: OTHER_USER_ID, departmentId: DEPT_ID }),
      );

      await expect(
        service.addEntry(ORG_ID, TARGET_ID, USER_ID, 'member', entryDto as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows supervisor to log on INDIVIDUAL target in their department', async () => {
      prisma.target.findUnique.mockResolvedValue(
        makeTarget({ type: 'INDIVIDUAL', assignedToId: OTHER_USER_ID, departmentId: DEPT_ID }),
      );
      prisma.userProfile.findUnique.mockResolvedValue({ departmentId: DEPT_ID });

      await expect(
        service.addEntry(ORG_ID, TARGET_ID, USER_ID, 'supervisor', entryDto as any),
      ).resolves.toBeDefined();
    });

    it('allows department member to log on TEAM target in same department', async () => {
      prisma.target.findUnique.mockResolvedValue(
        makeTarget({ type: 'TEAM', departmentId: DEPT_ID }),
      );
      prisma.userProfile.findUnique.mockResolvedValue({ departmentId: DEPT_ID });

      await expect(
        service.addEntry(ORG_ID, TARGET_ID, USER_ID, 'member', entryDto as any),
      ).resolves.toBeDefined();
    });

    it('throws ForbiddenException when member logs on TEAM target from another department', async () => {
      prisma.target.findUnique.mockResolvedValue(
        makeTarget({ type: 'TEAM', departmentId: OTHER_DEPT_ID }),
      );
      prisma.userProfile.findUnique.mockResolvedValue({ departmentId: DEPT_ID });

      await expect(
        service.addEntry(ORG_ID, TARGET_ID, USER_ID, 'member', entryDto as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ──────────────────────────────────────────
  //  deleteEntry()
  // ──────────────────────────────────────────

  describe('deleteEntry()', () => {
    const entryWithTarget = {
      id: ENTRY_ID,
      targetId: TARGET_ID,
      userId: USER_ID,
      value: 10,
      attachmentUrl: null,
      attachmentName: null,
      target: { organizationId: ORG_ID, parentTargetId: null, type: 'INDIVIDUAL' },
    };

    it('deletes entry created by the same user', async () => {
      prisma.targetEntry.findUnique.mockResolvedValue(entryWithTarget);
      prisma._txProxy.targetEntry.delete.mockResolvedValue({});
      prisma._txProxy.targetEntry.aggregate.mockResolvedValue({ _sum: { value: 0 } });
      prisma._txProxy.target.update.mockResolvedValue({});

      const result = await service.deleteEntry(ORG_ID, TARGET_ID, ENTRY_ID, USER_ID, 'member');
      expect(result).toEqual({ deleted: true });
      expect(gateway.emitTargetEntryDeleted).toHaveBeenCalled();
    });

    it('throws BadRequestException when entry not found', async () => {
      prisma.targetEntry.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteEntry(ORG_ID, TARGET_ID, 'bad-id', USER_ID, 'member'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when entry belongs to different org', async () => {
      prisma.targetEntry.findUnique.mockResolvedValue({
        ...entryWithTarget,
        target: { ...entryWithTarget.target, organizationId: 'other-org' },
      });

      await expect(
        service.deleteEntry(ORG_ID, TARGET_ID, ENTRY_ID, USER_ID, 'member'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when lower rank user tries to delete another users entry', async () => {
      prisma.targetEntry.findUnique.mockResolvedValue({
        ...entryWithTarget, userId: OTHER_USER_ID,
      });
      prisma.member.findFirst.mockResolvedValue({ role: 'admin' });

      await expect(
        service.deleteEntry(ORG_ID, TARGET_ID, ENTRY_ID, USER_ID, 'member'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows higher rank user to delete another users entry', async () => {
      prisma.targetEntry.findUnique.mockResolvedValue({
        ...entryWithTarget, userId: OTHER_USER_ID,
      });
      prisma.member.findFirst.mockResolvedValue({ role: 'member' });
      prisma._txProxy.targetEntry.delete.mockResolvedValue({});
      prisma._txProxy.targetEntry.aggregate.mockResolvedValue({ _sum: { value: 0 } });
      prisma._txProxy.target.update.mockResolvedValue({});

      const result = await service.deleteEntry(ORG_ID, TARGET_ID, ENTRY_ID, USER_ID, 'admin');
      expect(result).toEqual({ deleted: true });
    });

    it('deletes the cloudinary attachment when one exists', async () => {
      prisma.targetEntry.findUnique.mockResolvedValue({
        ...entryWithTarget, attachmentUrl: 'https://cloudinary.com/old.pdf',
      });
      prisma._txProxy.targetEntry.delete.mockResolvedValue({});
      prisma._txProxy.targetEntry.aggregate.mockResolvedValue({ _sum: { value: 0 } });
      prisma._txProxy.target.update.mockResolvedValue({});

      await service.deleteEntry(ORG_ID, TARGET_ID, ENTRY_ID, USER_ID, 'member');
      expect(upload.deleteFile).toHaveBeenCalledWith('https://cloudinary.com/old.pdf');
    });
  });

  // ──────────────────────────────────────────
  //  getStrategyMap()  → AC-4
  // ──────────────────────────────────────────

  describe('getStrategyMap()', () => {
    it('returns an empty array when no targets exist', async () => {
      prisma.target.findMany.mockResolvedValue([]);

      const result = await service.getStrategyMap(ORG_ID);
      expect(result).toEqual([]);
    });

    it('builds a nested tree with company targets as roots (AC-4)', async () => {
      const companyTarget = makeTarget({ id: 'c1', type: 'COMPANY', targetValue: 100, currentValue: 50, parentTargetId: null });
      const teamTarget = makeTarget({ id: 't1', type: 'TEAM', targetValue: 50, currentValue: 25, parentTargetId: 'c1' });
      const individualTarget = makeTarget({ id: 'i1', type: 'INDIVIDUAL', targetValue: 10, currentValue: 5, parentTargetId: 't1' });

      prisma.target.findMany.mockResolvedValue([companyTarget, teamTarget, individualTarget]);

      const result = await service.getStrategyMap(ORG_ID);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('c1');
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].id).toBe('t1');
      expect(result[0].children[0].children).toHaveLength(1);
      expect(result[0].children[0].children[0].id).toBe('i1');
    });

    it('computes progressPercent for each node (AC-4)', async () => {
      const target = makeTarget({ id: 'c1', type: 'COMPANY', targetValue: 200, currentValue: 50, parentTargetId: null });
      prisma.target.findMany.mockResolvedValue([target]);

      const result = await service.getStrategyMap(ORG_ID);

      expect(result[0].progressPercent).toBe(25); // 50/200 = 25%
    });

    it('returns 0 progressPercent when targetValue is 0', async () => {
      const target = makeTarget({ id: 'c1', type: 'COMPANY', targetValue: 0, currentValue: 0, parentTargetId: null });
      prisma.target.findMany.mockResolvedValue([target]);

      const result = await service.getStrategyMap(ORG_ID);
      expect(result[0].progressPercent).toBe(0);
    });

    it('excludes orphaned non company targets from the tree', async () => {
      const companyTarget = makeTarget({ id: 'c1', type: 'COMPANY', parentTargetId: null });
      const orphanTeam = makeTarget({ id: 't-orphan', type: 'TEAM', parentTargetId: null });

      prisma.target.findMany.mockResolvedValue([companyTarget, orphanTeam]);

      const result = await service.getStrategyMap(ORG_ID);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('c1');
    });

    it('filters by period when provided', async () => {
      prisma.target.findMany.mockResolvedValue([]);

      await service.getStrategyMap(ORG_ID, 'Q3 2026');

      const callArgs = prisma.target.findMany.mock.calls[0][0];
      expect(callArgs.where.period).toBe('Q3 2026');
    });

    it('does not add period filter when not provided', async () => {
      prisma.target.findMany.mockResolvedValue([]);

      await service.getStrategyMap(ORG_ID);

      const callArgs = prisma.target.findMany.mock.calls[0][0];
      expect(callArgs.where.period).toBeUndefined();
    });
  });
});
