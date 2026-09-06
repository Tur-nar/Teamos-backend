import { Test, TestingModule } from '@nestjs/testing';
import { TaskService } from './task.service';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { TaskGateway } from '../../gateway/task.gateway';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { NotificationService } from '../notification/notification.service';
import { AuditLogService } from '../../lib/audit/audit.service';

// ── Mocks ──────────────────────────────────────────────────────────

const mockPrisma = {
    member: { findFirst: jest.fn() },
    department: { findFirst: jest.fn() },
    task: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
    },
    subTask: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        aggregate: jest.fn(),
    },
    taskComment: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
    taskAttachment: {
        findFirst: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
    },
    userProfile: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    $transaction: jest.fn(),
};

const mockUploadService = {
    uploadTaskAttachment: jest.fn(),
    deleteFile: jest.fn(),
};

const mockTaskGateway = {
    emitTaskCreated: jest.fn(),
    emitTaskUpdated: jest.fn(),
    emitTaskStatusChanged: jest.fn(),
    emitTaskDeleted: jest.fn(),
    emitSubTaskAdded: jest.fn(),
    emitSubTaskUpdated: jest.fn(),
    emitSubTaskDeleted: jest.fn(),
    emitCommentAdded: jest.fn(),
    emitCommentUpdated: jest.fn(),
    emitCommentDeleted: jest.fn(),
};

const mockEventEmitter = {
    emit: jest.fn(),
};

const mockNotificationService = {
    create: jest.fn().mockResolvedValue({}),
    dispatch: jest.fn().mockResolvedValue({}),
};

const mockAuditLogService = {
    log: jest.fn().mockResolvedValue({}),
};

// ── Fixtures ───────────────────────────────────────────────────────

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const TASK_ID = 'task-1';

const TASK_FIXTURE = {
    id: TASK_ID, organizationId: ORG_ID, title: 'Test Task',
    status: 'NOT_STARTED', assignedById: USER_ID, assignedToId: 'user-2',
    departmentId: 'dept-1', dependsOnTaskId: null, completedAt: null,
};

const FULL_TASK = {
    ...TASK_FIXTURE,
    subTasks: [], department: { id: 'dept-1', name: 'Engineering' },
};

// ── Suite ──────────────────────────────────────────────────────────

describe('TaskService', () => {
    let service: TaskService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TaskService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: UploadService, useValue: mockUploadService },
                { provide: TaskGateway, useValue: mockTaskGateway },
                { provide: EventEmitter2, useValue: mockEventEmitter },
                { provide: NotificationService, useValue: mockNotificationService },
                { provide: AuditLogService, useValue: mockAuditLogService },
            ],
        }).compile();

        service = module.get<TaskService>(TaskService);
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // ── create ─────────────────────────────────────────────────

    describe('create', () => {
        const dto = {
            title: 'New Task', assignedToId: 'user-2', departmentId: 'dept-1',
            deadline: '2026-12-31', priority: 'HIGH',
        };

        it('creates a task and emits task:created', async () => {
            mockPrisma.member.findFirst.mockResolvedValue({ role: 'member' });
            mockPrisma.department.findFirst.mockResolvedValue({ id: 'dept-1' });
            mockPrisma.$transaction.mockResolvedValue(FULL_TASK);

            const result = await service.create(ORG_ID, USER_ID, dto as any);

            expect(result).toEqual(FULL_TASK);
            expect(mockTaskGateway.emitTaskCreated).toHaveBeenCalledWith(ORG_ID, FULL_TASK);
        });

        it('throws when assignee is not a member of the org', async () => {
            mockPrisma.member.findFirst.mockResolvedValue(null);

            await expect(service.create(ORG_ID, USER_ID, dto as any))
                .rejects.toThrow(BadRequestException);
        });

        it('throws when department is invalid or assignee not active in it', async () => {
            mockPrisma.member.findFirst.mockResolvedValue({ role: 'member' });
            mockPrisma.department.findFirst.mockResolvedValue(null);

            await expect(service.create(ORG_ID, USER_ID, dto as any))
                .rejects.toThrow(BadRequestException);
        });

        it('throws when dependency task does not exist', async () => {
            mockPrisma.member.findFirst.mockResolvedValue({ role: 'member' });
            mockPrisma.department.findFirst.mockResolvedValue({ id: 'dept-1' });
            mockPrisma.task.findFirst.mockResolvedValue(null);

            const dtoWithDep = { ...dto, dependsOnTaskId: 'nonexistent' };

            await expect(service.create(ORG_ID, USER_ID, dtoWithDep as any))
                .rejects.toThrow(BadRequestException);
        });
    });

    // ── findAll ────────────────────────────────────────────────

    describe('findAll', () => {
        it('throws when user is not a member', async () => {
            mockPrisma.member.findFirst.mockResolvedValue(null);

            await expect(service.findAll(ORG_ID, USER_ID, {}))
                .rejects.toThrow(NotFoundException);
        });

        it('scopes to own tasks for member role', async () => {
            mockPrisma.member.findFirst.mockResolvedValue({ role: 'member' });
            mockPrisma.task.findMany.mockResolvedValue([]);

            await service.findAll(ORG_ID, USER_ID, {});

            expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ assignedToId: USER_ID }),
                }),
            );
        });

        it('scopes to team tasks for supervisor role', async () => {
            mockPrisma.member.findFirst.mockResolvedValue({ role: 'supervisor' });
            mockPrisma.userProfile.findMany.mockResolvedValue([{ userId: 'team-user-1' }]);
            mockPrisma.task.findMany.mockResolvedValue([]);

            await service.findAll(ORG_ID, USER_ID, {});

            expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        assignedToId: { in: ['team-user-1', USER_ID] },
                    }),
                }),
            );
        });

        it('applies status/priority/departmentId filters', async () => {
            mockPrisma.member.findFirst.mockResolvedValue({ role: 'admin' });
            mockPrisma.task.findMany.mockResolvedValue([]);

            await service.findAll(ORG_ID, USER_ID, { status: 'IN_PROGRESS', priority: 'HIGH', departmentId: 'dept-1' });

            expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        status: 'IN_PROGRESS',
                        priority: 'HIGH',
                        departmentId: 'dept-1',
                    }),
                }),
            );
        });
    });

    // ── findOne ────────────────────────────────────────────────

    describe('findOne', () => {
        it('returns task when found', async () => {
            mockPrisma.task.findFirst.mockResolvedValue(FULL_TASK);

            const result = await service.findOne(ORG_ID, TASK_ID);
            expect(result).toEqual(FULL_TASK);
        });

        it('throws NotFoundException when task does not exist', async () => {
            mockPrisma.task.findFirst.mockResolvedValue(null);

            await expect(service.findOne(ORG_ID, 'nonexistent'))
                .rejects.toThrow(NotFoundException);
        });
    });

    // ── updateStatus ───────────────────────────────────────────

    describe('updateStatus', () => {
        it('updates status and emits event', async () => {
            mockPrisma.task.findFirst.mockResolvedValue({ ...TASK_FIXTURE, status: 'IN_PROGRESS', dependsOn: null });
            mockPrisma.member.findFirst.mockResolvedValue({ role: 'admin' });
            mockPrisma.task.update.mockResolvedValue({ ...TASK_FIXTURE, status: 'COMPLETED' });

            const result = await service.updateStatus(ORG_ID, TASK_ID, { status: 'COMPLETED' } as any, USER_ID);

            expect(mockTaskGateway.emitTaskStatusChanged).toHaveBeenCalledWith(ORG_ID, TASK_ID, 'COMPLETED');
            expect(result.status).toBe('COMPLETED');
        });

        it('throws when task not found', async () => {
            mockPrisma.task.findFirst.mockResolvedValue(null);

            await expect(service.updateStatus(ORG_ID, TASK_ID, { status: 'COMPLETED' } as any, USER_ID))
                .rejects.toThrow(NotFoundException);
        });

        it('throws when user is not a member', async () => {
            mockPrisma.task.findFirst.mockResolvedValue({ ...TASK_FIXTURE, dependsOn: null });
            mockPrisma.member.findFirst.mockResolvedValue(null);

            await expect(service.updateStatus(ORG_ID, TASK_ID, { status: 'COMPLETED' } as any, USER_ID))
                .rejects.toThrow(NotFoundException);
        });

        it('throws when member tries to change status of a task not assigned to them', async () => {
            mockPrisma.task.findFirst.mockResolvedValue({ ...TASK_FIXTURE, assignedToId: 'other-user', dependsOn: null });
            mockPrisma.member.findFirst.mockResolvedValue({ role: 'member' });

            await expect(service.updateStatus(ORG_ID, TASK_ID, { status: 'COMPLETED' } as any, USER_ID))
                .rejects.toThrow(ForbiddenException);
        });

        it('prevents overdue tasks from moving back to IN_PROGRESS', async () => {
            mockPrisma.task.findFirst.mockResolvedValue({ ...TASK_FIXTURE, status: 'OVERDUE', dependsOn: null });
            mockPrisma.member.findFirst.mockResolvedValue({ role: 'admin' });

            await expect(service.updateStatus(ORG_ID, TASK_ID, { status: 'IN_PROGRESS' } as any, USER_ID))
                .rejects.toThrow(BadRequestException);
        });

        it('auto converts to COMPLETED_LATE when completing an overdue task', async () => {
            mockPrisma.task.findFirst.mockResolvedValue({ ...TASK_FIXTURE, status: 'OVERDUE', dependsOn: null });
            mockPrisma.member.findFirst.mockResolvedValue({ role: 'admin' });
            mockPrisma.task.update.mockResolvedValue({ ...TASK_FIXTURE, status: 'COMPLETED_LATE' });

            await service.updateStatus(ORG_ID, TASK_ID, { status: 'COMPLETED' } as any, USER_ID);

            expect(mockPrisma.task.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ status: 'COMPLETED_LATE' }),
                }),
            );
        });

        it('blocks status change when dependency is not completed', async () => {
            mockPrisma.task.findFirst.mockResolvedValue({
                ...TASK_FIXTURE, status: 'NOT_STARTED',
                dependsOnTaskId: 'dep-task',
                dependsOn: { id: 'dep-task', title: 'Dep', status: 'IN_PROGRESS' },
            });
            mockPrisma.member.findFirst.mockResolvedValue({ role: 'admin' });

            await expect(service.updateStatus(ORG_ID, TASK_ID, { status: 'IN_PROGRESS' } as any, USER_ID))
                .rejects.toThrow(BadRequestException);
        });
    });

    // ── remove ─────────────────────────────────────────────────

    describe('remove', () => {
        it('deletes task and emits event', async () => {
            mockPrisma.task.findFirst.mockResolvedValue({
                ...TASK_FIXTURE, dependents: [], attachments: [],
            });
            mockPrisma.task.delete.mockResolvedValue(undefined);

            await service.remove(ORG_ID, TASK_ID, USER_ID, 'admin');

            expect(mockPrisma.task.delete).toHaveBeenCalledWith({ where: { id: TASK_ID } });
            expect(mockTaskGateway.emitTaskDeleted).toHaveBeenCalledWith(ORG_ID, TASK_ID);
        });

        it('throws when task not found', async () => {
            mockPrisma.task.findFirst.mockResolvedValue(null);

            await expect(service.remove(ORG_ID, TASK_ID, USER_ID, 'admin'))
                .rejects.toThrow(NotFoundException);
        });

        it('throws when user cannot outrank the task assigner', async () => {
            mockPrisma.task.findFirst.mockResolvedValue({
                ...TASK_FIXTURE, assignedById: 'other-user', dependents: [], attachments: [],
            });
            mockPrisma.member.findFirst.mockResolvedValue({ role: 'admin' });

            await expect(service.remove(ORG_ID, TASK_ID, USER_ID, 'member'))
                .rejects.toThrow(ForbiddenException);
        });

        it('throws when task has dependents', async () => {
            mockPrisma.task.findFirst.mockResolvedValue({
                ...TASK_FIXTURE, dependents: [{ id: 'd1', title: 'Dep Task' }], attachments: [],
            });

            await expect(service.remove(ORG_ID, TASK_ID, USER_ID, 'admin'))
                .rejects.toThrow(BadRequestException);
        });
    });

    // ── getStats ───────────────────────────────────────────────

    describe('getStats', () => {
        it('returns correct stat counts and completion rate', async () => {
            mockPrisma.task.count
                .mockResolvedValueOnce(10)  // total
                .mockResolvedValueOnce(3)   // notStarted
                .mockResolvedValueOnce(2)   // inProgress
                .mockResolvedValueOnce(4)   // completed
                .mockResolvedValueOnce(0)   // overdue
                .mockResolvedValueOnce(1);  // completedLate

            const result = await service.getStats(ORG_ID);

            expect(result).toEqual({
                total: 10, notStarted: 3, inProgress: 2,
                completed: 4, overdue: 0, completedLate: 1,
                completionRate: 50, // (4+1)/10 * 100
            });
        });

        it('returns 0 completion rate when no tasks exist', async () => {
            mockPrisma.task.count.mockResolvedValue(0);

            const result = await service.getStats(ORG_ID);
            expect(result.completionRate).toBe(0);
        });
    });

    // ── addSubTask ─────────────────────────────────────────────

    describe('addSubTask', () => {
        it('creates subtask and emits event', async () => {
            mockPrisma.task.findFirst.mockResolvedValue(TASK_FIXTURE);
            mockPrisma.subTask.aggregate.mockResolvedValue({ _max: { order: 2 } });
            const createdSubTask = { id: 'st-1', title: 'Sub', order: 3, task: TASK_FIXTURE };
            mockPrisma.subTask.create.mockResolvedValue(createdSubTask);
            mockPrisma.task.update.mockResolvedValue(undefined);

            const result = await service.addSubTask(ORG_ID, TASK_ID, { title: 'Sub' });

            expect(result).toEqual(createdSubTask);
            expect(mockTaskGateway.emitSubTaskAdded).toHaveBeenCalledWith(ORG_ID, createdSubTask);
        });

        it('throws when parent task is completed', async () => {
            mockPrisma.task.findFirst.mockResolvedValue({ ...TASK_FIXTURE, status: 'COMPLETED' });

            await expect(service.addSubTask(ORG_ID, TASK_ID, { title: 'Sub' }))
                .rejects.toThrow(BadRequestException);
        });

        it('auto transitions NOT_STARTED task to IN_PROGRESS when subtask added', async () => {
            mockPrisma.task.findFirst.mockResolvedValue({ ...TASK_FIXTURE, status: 'NOT_STARTED' });
            mockPrisma.subTask.aggregate.mockResolvedValue({ _max: { order: null } });
            mockPrisma.subTask.create.mockResolvedValue({ id: 'st-1', title: 'Sub', order: 1, task: TASK_FIXTURE });

            await service.addSubTask(ORG_ID, TASK_ID, { title: 'Sub' });

            expect(mockPrisma.task.update).toHaveBeenCalledWith({
                where: { id: TASK_ID },
                data: { status: 'IN_PROGRESS' },
            });
        });
    });

    // ── updateSubTask ──────────────────────────────────────────

    describe('updateSubTask', () => {
        it('throws when member tries to edit subtask title', async () => {
            mockPrisma.task.findFirst.mockResolvedValue(TASK_FIXTURE);
            mockPrisma.subTask.findFirst.mockResolvedValue({ id: 'st-1', title: 'Old', taskId: TASK_ID });

            await expect(service.updateSubTask(ORG_ID, TASK_ID, 'st-1', { title: 'New' }, 'member'))
                .rejects.toThrow(ForbiddenException);
        });

        it('throws when new title is the same as current', async () => {
            mockPrisma.task.findFirst.mockResolvedValue(TASK_FIXTURE);
            mockPrisma.subTask.findFirst.mockResolvedValue({ id: 'st-1', title: 'Same', taskId: TASK_ID });

            await expect(service.updateSubTask(ORG_ID, TASK_ID, 'st-1', { title: 'Same' }, 'admin'))
                .rejects.toThrow(BadRequestException);
        });

        it('throws when task is completed', async () => {
            mockPrisma.task.findFirst.mockResolvedValue({ ...TASK_FIXTURE, status: 'COMPLETED' });

            await expect(service.updateSubTask(ORG_ID, TASK_ID, 'st-1', { title: 'New' }, 'admin'))
                .rejects.toThrow(BadRequestException);
        });
    });

    // ── removeSubTask ──────────────────────────────────────────

    describe('removeSubTask', () => {
        it('deletes subtask and emits event', async () => {
            mockPrisma.task.findFirst.mockResolvedValue(TASK_FIXTURE);
            mockPrisma.subTask.findFirst.mockResolvedValue({ id: 'st-1', taskId: TASK_ID });
            mockPrisma.subTask.delete.mockResolvedValue(undefined);

            await service.removeSubTask(ORG_ID, TASK_ID, 'st-1', 'admin', USER_ID);

            expect(mockPrisma.subTask.delete).toHaveBeenCalledWith({ where: { id: 'st-1' } });
            expect(mockTaskGateway.emitSubTaskUpdated).toHaveBeenCalledWith(ORG_ID, 'st-1');
        });

        it('throws when subtask not found', async () => {
            mockPrisma.task.findFirst.mockResolvedValue(TASK_FIXTURE);
            mockPrisma.subTask.findFirst.mockResolvedValue(null);

            await expect(service.removeSubTask(ORG_ID, TASK_ID, 'st-1', 'admin', USER_ID))
                .rejects.toThrow(NotFoundException);
        });

        it('throws when user cannot outrank task assigner', async () => {
            mockPrisma.task.findFirst.mockResolvedValue({ ...TASK_FIXTURE, assignedById: 'other-user' });
            mockPrisma.subTask.findFirst.mockResolvedValue({ id: 'st-1', taskId: TASK_ID });
            mockPrisma.member.findFirst.mockResolvedValue({ role: 'admin' });

            await expect(service.removeSubTask(ORG_ID, TASK_ID, 'st-1', 'member', USER_ID))
                .rejects.toThrow(ForbiddenException);
        });
    });

    // ── addComment ─────────────────────────────────────────────

    describe('addComment', () => {
        it('creates a comment on a valid task', async () => {
            mockPrisma.task.findFirst.mockResolvedValue(TASK_FIXTURE);
            const created = { id: 'c1', content: 'Hello', taskId: TASK_ID, userId: USER_ID };
            mockPrisma.taskComment.create.mockResolvedValue(created);

            const result = await service.addComment(ORG_ID, TASK_ID, { content: 'Hello' }, USER_ID);

            expect(result).toEqual(created);
        });

        it('throws when task does not exist', async () => {
            mockPrisma.task.findFirst.mockResolvedValue(null);

            await expect(service.addComment(ORG_ID, TASK_ID, { content: 'Hello' }, USER_ID))
                .rejects.toThrow(NotFoundException);
        });

        it('throws when parent comment does not exist', async () => {
            mockPrisma.task.findFirst.mockResolvedValue(TASK_FIXTURE);
            mockPrisma.taskComment.findFirst.mockResolvedValue(null);

            await expect(service.addComment(ORG_ID, TASK_ID, { content: 'Reply', parentCommentId: 'bad-id' }, USER_ID))
                .rejects.toThrow(NotFoundException);
        });
    });

    // ── removeComment ──────────────────────────────────────────

    describe('removeComment', () => {
        it('deletes own comment and emits event', async () => {
            mockPrisma.task.findFirst.mockResolvedValue(TASK_FIXTURE);
            mockPrisma.taskComment.findFirst.mockResolvedValue({ id: 'c1', userId: USER_ID, taskId: TASK_ID });
            mockPrisma.taskComment.delete.mockResolvedValue(undefined);

            await service.removeComment(ORG_ID, TASK_ID, 'c1', USER_ID, 'member');

            expect(mockPrisma.taskComment.delete).toHaveBeenCalled();
            expect(mockTaskGateway.emitCommentDeleted).toHaveBeenCalledWith(ORG_ID, 'c1');
        });

        it('throws when trying to delete another users comment without outranking', async () => {
            mockPrisma.task.findFirst.mockResolvedValue(TASK_FIXTURE);
            mockPrisma.taskComment.findFirst.mockResolvedValue({ id: 'c1', userId: 'other-user', taskId: TASK_ID });
            mockPrisma.member.findFirst.mockResolvedValue({ role: 'admin' });

            await expect(service.removeComment(ORG_ID, TASK_ID, 'c1', USER_ID, 'member'))
                .rejects.toThrow(ForbiddenException);
        });

        it('throws when comment not found', async () => {
            mockPrisma.task.findFirst.mockResolvedValue(TASK_FIXTURE);
            mockPrisma.taskComment.findFirst.mockResolvedValue(null);

            await expect(service.removeComment(ORG_ID, TASK_ID, 'c1', USER_ID, 'admin'))
                .rejects.toThrow(NotFoundException);
        });
    });

    // ── updateComment ──────────────────────────────────────────

    describe('updateComment', () => {
        it('throws when comment content is unchanged', async () => {
            mockPrisma.task.findFirst.mockResolvedValue(TASK_FIXTURE);
            mockPrisma.taskComment.findFirst.mockResolvedValue({ id: 'c1', content: 'Same', userId: USER_ID });

            await expect(service.updateComment(ORG_ID, TASK_ID, 'c1', USER_ID, { content: 'Same' }))
                .rejects.toThrow(BadRequestException);
        });

        it('throws when user tries to edit someone elses comment', async () => {
            mockPrisma.task.findFirst.mockResolvedValue(TASK_FIXTURE);
            mockPrisma.taskComment.findFirst.mockResolvedValue({ id: 'c1', content: 'Old', userId: 'other-user' });

            await expect(service.updateComment(ORG_ID, TASK_ID, 'c1', USER_ID, { content: 'New' }))
                .rejects.toThrow(ForbiddenException);
        });
    });

    // ── removeAttachment ───────────────────────────────────────

    describe('removeAttachment', () => {
        it('deletes own attachment', async () => {
            mockPrisma.task.findFirst.mockResolvedValue(TASK_FIXTURE);
            mockPrisma.taskAttachment.findFirst.mockResolvedValue({
                id: 'att-1', taskId: TASK_ID, uploadedById: USER_ID, fileUrl: 'url',
            });
            mockUploadService.deleteFile.mockResolvedValue(undefined);
            mockPrisma.taskAttachment.delete.mockResolvedValue(undefined);

            await service.removeAttachment(ORG_ID, TASK_ID, 'att-1', USER_ID, 'member');

            expect(mockUploadService.deleteFile).toHaveBeenCalledWith('url');
            expect(mockPrisma.taskAttachment.delete).toHaveBeenCalled();
        });

        it('throws when attachment not found', async () => {
            mockPrisma.task.findFirst.mockResolvedValue(TASK_FIXTURE);
            mockPrisma.taskAttachment.findFirst.mockResolvedValue(null);

            await expect(service.removeAttachment(ORG_ID, TASK_ID, 'att-1', USER_ID, 'admin'))
                .rejects.toThrow(NotFoundException);
        });

        it('throws when user cannot outrank the uploader', async () => {
            mockPrisma.task.findFirst.mockResolvedValue(TASK_FIXTURE);
            mockPrisma.taskAttachment.findFirst.mockResolvedValue({
                id: 'att-1', taskId: TASK_ID, uploadedById: 'other-user', fileUrl: 'url',
            });
            mockPrisma.member.findFirst.mockResolvedValue({ role: 'admin' });

            await expect(service.removeAttachment(ORG_ID, TASK_ID, 'att-1', USER_ID, 'member'))
                .rejects.toThrow(ForbiddenException);
        });
    });
});
