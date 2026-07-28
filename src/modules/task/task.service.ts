import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { UploadService } from '../upload/upload.service';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { Priority, TaskStatus } from '@prisma/client';
import { UpdateTaskDto } from './dto/update-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { CreateSubTaskDto } from './dto/create-subtask.dto';
import { UpdateSubTaskDto } from './dto/update-subtask.dto';
import { ReorderSubTaskDto } from './dto/reorder-subtasks.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { outranks } from '../../lib/common/constants/role-rank';
import { TaskGateway } from '../../gateway/task.gateway';

@Injectable()
export class TaskService {
    constructor(
        private readonly uploadService: UploadService,
        private readonly prisma: PrismaService,
        private readonly taskGateway: TaskGateway
    ) { }

    async create(orgId: string, assignedById: string, dto: CreateTaskDto) {
        const assigneeMembership = await this.prisma.member.findFirst({ where: { organizationId: orgId, userId: dto.assignedToId, }, })
        if (!assigneeMembership) throw new BadRequestException("Assignee is not a member of this organization");

        const departmentExist = await this.prisma.department.findFirst({
            where: { id: dto.departmentId, organizationId: orgId, staff: { some: { userId: dto.assignedToId, status: "active" } }, }
        })
        if (!departmentExist) throw new BadRequestException("Department is not valid or Assignee is not an active member of this department");

        if (dto.dependsOnTaskId) {
            const dependsOn = await this.prisma.task.findFirst({ where: { id: dto.dependsOnTaskId, organizationId: orgId, } })
            if (!dependsOn) throw new BadRequestException("Task to depend on does not exist in this organization or may have been deleted");
        }

        const task = await this.prisma.$transaction(async (tx) => {
            const createdTask = await tx.task.create({
                data: {
                    organizationId: orgId, assignedById, assignedToId: dto.assignedToId, departmentId: dto.departmentId,
                    title: dto.title, description: dto.description, priority: dto.priority as Priority,
                    deadline: dto.deadline, estimatedHours: dto.estimatedHours, tags: dto.tags ?? [],
                }
            });
            if (dto.subTasks?.length) {
                await tx.subTask.createMany({
                    data: dto.subTasks.map((sub, i) => ({ taskId: createdTask.id, title: sub.title, order: sub.order ?? i, }))
                })
            }

            const fullTask = await tx.task.findUnique({
                where: { id: createdTask.id },
                include: { subTasks: { orderBy: { order: 'asc' } }, department: true },
            });

            if (!fullTask) throw new Error("Failed to load task immediately after creation")

            return fullTask;
        });

        this.taskGateway.emitTaskCreated(orgId, task);
        return task;
    }

    async findAll(orgId: string, userId: string, filters: any) {
        const member = await this.prisma.member.findFirst({ where: { organizationId: orgId, userId, }, select: { role: true } })
        if (!member) throw new NotFoundException("You are not a member of this organization");

        const where: any = { organizationId: orgId, };
        if (member?.role === 'member') { where.assignedToId = userId; }

        if (member?.role === 'supervisor') {
            const teamProfiles = await this.prisma.userProfile.findMany({
                where: { supervisorId: userId, organizationId: orgId },
                select: { userId: true },
            });
            const teamUserIds = teamProfiles.map(p => p.userId);
            teamUserIds.push(userId); // supervisor sees own tasks too
            where.assignedToId = { in: teamUserIds };
        }

        if (filters?.status) where.status = filters.status;
        if (filters?.priority) where.priority = filters.priority;
        if (filters?.departmentId) where.departmentId = filters.departmentId;
        if (filters?.assignedToId && member?.role === 'owner' || member?.role === 'admin') where.assignedToId = filters.assignedToId;

        return this.prisma.task.findMany({
            where,
            include: {
                subTasks: { orderBy: { order: 'asc' } }, department: true,
                assignedBy: { select: { id: true, name: true, email: true, image: true, members: { where: { organizationId: orgId, }, select: { role: true } } } },
                assignedTo: { select: { id: true, name: true, email: true, image: true, members: { where: { organizationId: orgId, }, select: { role: true } } } },
                dependsOn: { select: { id: true, title: true, status: true } }
            }
        });
    }

    async findOne(orgId: string, taskId: string) {
        const task = await this.prisma.task.findFirst({
            where: { id: taskId, organizationId: orgId },
            include: {
                subTasks: { orderBy: { order: 'asc' } },
                comments: {
                    where: { parentCommentId: null }, include: { replies: { orderBy: { createdAt: 'asc' } } },
                    orderBy: { createdAt: 'asc' },
                },
                department: true,
                assignedBy: { select: { id: true, name: true, email: true, image: true, members: { where: { organizationId: orgId, }, select: { role: true } } } },
                assignedTo: { select: { id: true, name: true, email: true, image: true, members: { where: { organizationId: orgId, }, select: { role: true } } } },
                dependsOn: { select: { id: true, title: true, status: true } },
                dependents: { select: { id: true, title: true, status: true } },
                attachments: true
            }
        })
        if (!task) throw new NotFoundException("Task not found");
        return task;
    }

    async update(orgId: string, taskId: string, dto: UpdateTaskDto) {
        const task = await this.getTaskOrThrow(orgId, taskId);

        if (dto.assignedToId && task.assignedToId !== dto.assignedToId) {
            const assigneeMembership = await this.prisma.member.findFirst({
                where: { organizationId: orgId, userId: dto.assignedToId, },
            })
            if (!assigneeMembership) throw new BadRequestException("Assignee is not a member of this organization");
        }

        if (dto.departmentId && task.departmentId !== dto.departmentId) {
            const departmentExist = await this.prisma.department.findFirst({
                where: { id: dto.departmentId, organizationId: orgId, }
            })
            if (!departmentExist) throw new BadRequestException("Department does not exist in this organization");
        }

        if (dto.dependsOnTaskId && task.dependsOnTaskId !== dto.dependsOnTaskId) {
            const dependsOn = await this.prisma.task.findFirst({ where: { id: dto.dependsOnTaskId, organizationId: orgId, } })
            if (!dependsOn) throw new BadRequestException("Task to depend on does not exist in this organization or may have been deleted");
            if (dto.dependsOnTaskId === taskId) throw new BadRequestException("A task cannot depend on itself");

            let current: string | null = dto.dependsOnTaskId;
            const visited = new Set<string>();
            while (current) {
                if (current === taskId) {
                    throw new BadRequestException('Circular dependency detected: task cannot depend on itself or its dependents');
                }
                if (visited.has(current)) break;
                visited.add(current);

                const parent = await this.prisma.task.findUnique({ where: { id: current }, select: { dependsOnTaskId: true }, });
                current = parent?.dependsOnTaskId ?? null;
            }
        }

        const updatedTask = await this.prisma.task.update({
            where: { id: taskId },
            data: {
                ...(dto.title && { title: dto.title }),
                ...(dto.description !== undefined && { description: dto.description }),
                ...(dto.priority && { priority: dto.priority as Priority }),
                ...(dto.deadline && { deadline: dto.deadline }),
                ...(dto.assignedToId && { assignedToId: dto.assignedToId }),
                ...(dto.departmentId && { departmentId: dto.departmentId }),
                ...(dto.dependsOnTaskId !== undefined && { dependsOnTaskId: dto.dependsOnTaskId }),
                ...(dto.estimatedHours !== undefined && { estimatedHours: dto.estimatedHours }),
                ...(dto.tags && { tags: dto.tags }),
            },
            include: {
                subTasks: { orderBy: { order: 'asc' } },
                department: true,
                assignedTo: { select: { id: true, name: true, email: true, image: true } },
                assignedBy: { select: { id: true, name: true, email: true, image: true } },
                dependsOn: { select: { id: true, title: true, status: true } },
                dependents: { select: { id: true, title: true, status: true } },
            },
        });

        if (!updatedTask) throw new Error("Failed to update task immediately after update");
        this.taskGateway.emitTaskUpdated(orgId, updatedTask);
        return updatedTask;
    };

    async updateStatus(orgId: string, taskId: string, dto: UpdateTaskStatusDto, userId: string) {
        const task = await this.prisma.task.findFirst({
            where: { id: taskId, organizationId: orgId }, include: { dependsOn: true }
        })
        if (!task) throw new NotFoundException("Task not found");

        const membership = await this.prisma.member.findFirst({
            where: { userId, organizationId: orgId },
            select: { role: true }
        })
        if (!membership) throw new NotFoundException("You are not a member of this organization");
        if (membership?.role === 'member' && task.assignedToId !== userId) throw new ForbiddenException("You can only tasks assigned to you");

        // overdue status check
        const newStatus = dto.status;
        const currentStatus = task.status;
        if (currentStatus === 'OVERDUE' && (newStatus === 'IN_PROGRESS' || newStatus === 'NOT_STARTED')) {
            throw new BadRequestException("Overdue tasks cannot be moved back to in progress or not started");
        }

        // dependency check
        if ((newStatus === 'IN_PROGRESS' || newStatus === 'COMPLETED' || newStatus === 'COMPLETED_LATE') && task.dependsOnTaskId) {
            const dependency = task.dependsOn;
            if (dependency && !['COMPLETED', 'COMPLETED_LATE'].includes(dependency.status)) {
                throw new BadRequestException(`Cannot start: depends on "${dependency.title}" which is not yet completed`);
            }
        }

        // completed late (auto-detect)
        let finalStatus = newStatus;
        let completedAt = task.completedAt;
        if (newStatus === 'COMPLETED') {
            if (currentStatus === 'OVERDUE') {
                finalStatus = 'COMPLETED_LATE';
            }
            completedAt = new Date();
        }

        if (newStatus === 'NOT_STARTED' || newStatus === 'IN_PROGRESS') {
            completedAt = null;
        }

        const updatedTask = await this.prisma.task.update({
            where: { id: taskId },
            data: { status: finalStatus as TaskStatus, completedAt: completedAt },
            include: { subTasks: true, department: true }
        })

        if (!updatedTask) throw new Error("Failed to update task immediately after update")
        this.taskGateway.emitTaskStatusChanged(orgId, taskId, finalStatus)
        return updatedTask;
    }

    async remove(orgId: string, taskId: string, userId: string, userRole: string) {
        const task = await this.prisma.task.findFirst({
            where: { id: taskId, organizationId: orgId },
            include: {
                dependents: { select: { id: true, title: true } }, attachments: { select: { fileUrl: true } }
            }
        });
        if (!task) throw new NotFoundException("Task not found");

        if (task.assignedById !== userId) {
            const assignerMember = await this.prisma.member.findFirst({
                where: { userId: task.assignedById, organizationId: orgId },
                select: { role: true }
            });

            if (!outranks(userRole, assignerMember?.role ?? 'member')) {
                throw new ForbiddenException("You can only delete tasks you assigned, or tasks assigned by someone below your level");
            }
        }

        if (task.dependents.length > 0) {
            const names = task.dependents.map(t => `"${t.title}"`).join(", ");
            throw new BadRequestException(`Cannot delete: ${task.title} is a prerequisite for other tasks: ${names}. Remove the dependencies first`);
        }
        await Promise.allSettled(task.attachments.map(a => this.uploadService.deleteFile(a.fileUrl)));

        await this.prisma.task.delete({ where: { id: taskId } })
        this.taskGateway.emitTaskDeleted(orgId, taskId);
    }

    async getStats(orgId: string) {
        const [total, notStarted, inProgress, completed, overdue, completedLate] = await Promise.all([
            this.prisma.task.count({ where: { organizationId: orgId } }),
            this.prisma.task.count({ where: { organizationId: orgId, status: 'NOT_STARTED' } }),
            this.prisma.task.count({ where: { organizationId: orgId, status: 'IN_PROGRESS' } }),
            this.prisma.task.count({ where: { organizationId: orgId, status: 'COMPLETED' } }),
            this.prisma.task.count({ where: { organizationId: orgId, status: 'OVERDUE' } }),
            this.prisma.task.count({ where: { organizationId: orgId, status: 'COMPLETED_LATE' } }),
        ]);
        const completionRate = total > 0 ? Math.round(((completed + completedLate) / total) * 100) : 0;
        return { total, notStarted, inProgress, completed, overdue, completedLate, completionRate }
    }

    async addSubTask(orgId: string, taskId: string, dto: CreateSubTaskDto) {
        const task = await this.getTaskOrThrow(orgId, taskId);
        if (task.status === 'COMPLETED' || task.status === 'COMPLETED_LATE') throw new BadRequestException("Completed tasks cannot have subtasks added");

        const maxOrder = await this.prisma.subTask.aggregate({
            where: { taskId },
            _max: { order: true },
        });

        const order = (maxOrder._max.order ?? 0) + 1;

        const subTask = await this.prisma.subTask.create({
            data: { title: dto.title, taskId, order, }, include: { task: true }
        });

        if (task.status === 'NOT_STARTED') {
            await this.prisma.task.update({ where: { id: taskId }, data: { status: 'IN_PROGRESS' } });
        }

        if (!subTask) throw new Error('Failed to update sub-task immediately after update')
        this.taskGateway.emitSubTaskAdded(orgId, subTask)
        return subTask;
    }

    async updateSubTask(orgId: string, taskId: string, subTaskId: string, dto: UpdateSubTaskDto, userRole: string) {
        const task = await this.getTaskOrThrow(orgId, taskId);
        if (task.status === 'COMPLETED' || task.status === 'COMPLETED_LATE') throw new BadRequestException("Completed tasks cannot have subtasks edited");

        const subTask = await this.prisma.subTask.findFirst({
            where: { id: subTaskId, taskId },
        });
        if (!subTask) throw new NotFoundException("Subtask not found");

        if (dto.title !== undefined && subTask.title === dto.title) {
            throw new BadRequestException("Title is the same as the current title");
        }
        if (dto.title !== undefined && userRole === 'member') throw new ForbiddenException("Member cannot edit subtasks");

        const updatedSubTask = this.prisma.subTask.update({
            where: { id: subTaskId },
            data: { ...dto }
        });

        if (!updatedSubTask) throw new Error('Failed to update sub-task immediately after update')
        this.taskGateway.emitSubTaskUpdated(orgId, updatedSubTask)
        return updatedSubTask;
    }

    async reorderSubTasks(orgId: string, taskId: string, dto: ReorderSubTaskDto) {
        await this.getTaskOrThrow(orgId, taskId);

        await this.prisma.$transaction(
            dto.orderedIds.map((id, index) =>
                this.prisma.subTask.update({
                    where: { id },
                    data: { order: index },
                }),
            ),
        );

        return this.prisma.subTask.findMany({ where: { taskId }, orderBy: { order: 'asc' } });
    }

    async removeSubTask(orgId: string, taskId: string, subTaskId: string, userRole: string, userId: string) {
        const task = await this.getTaskOrThrow(orgId, taskId);
        if (task.status === 'COMPLETED' || task.status === 'COMPLETED_LATE') throw new BadRequestException("Completed tasks cannot have subtasks deleted");

        const subTask = await this.prisma.subTask.findFirst({
            where: { id: subTaskId, taskId },
        });
        if (!subTask) throw new NotFoundException("Subtask not found");

        if (task.assignedById !== userId) {
            const assignerMember = await this.prisma.member.findFirst({
                where: { userId: task.assignedById, organizationId: orgId },
                select: { role: true }
            });

            if (!outranks(userRole, assignerMember?.role ?? 'member')) {
                throw new ForbiddenException("You can only delete subtasks of tasks you assigned, or subtask of tasks assigned by someone below your level");
            }
        }

        await this.prisma.subTask.delete({ where: { id: subTaskId } });
        this.taskGateway.emitSubTaskUpdated(orgId, subTaskId)
    }

    async addComment(orgId: string, taskId: string, dto: CreateCommentDto, userId: string) {
        await this.getTaskOrThrow(orgId, taskId);

        if (dto.parentCommentId) {
            const parentComment = await this.prisma.taskComment.findFirst({
                where: { id: dto.parentCommentId, taskId }
            })
            if (!parentComment) throw new NotFoundException('Parent comment not found on this task')
        }

        return this.prisma.taskComment.create({
            data: {
                taskId, userId, content: dto.content, parentCommentId: dto.parentCommentId,
            }
        })
    }

    async getComments(orgId: string, taskId: string) {
        await this.getTaskOrThrow(orgId, taskId);
        const comments = await this.prisma.taskComment.findMany({
            where: { taskId },
            include: { replies: { orderBy: { createdAt: 'asc' } } },
            orderBy: { createdAt: 'asc' },
        })

        const userIds = [...new Set(comments.flatMap(c => [c.userId, ...c.replies.map(r => r.userId)]))];

        const users = await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, image: true }
        })

        const userMap = new Map(users.map(u => [u.id, u]));

        return comments.map(comment => ({
            ...comment,
            author: userMap.get(comment.userId) ?? null,
            replies: comment.replies.map(reply => ({ ...reply, author: userMap.get(reply.userId) ?? null })),
        }));
    };

    async updateComment(orgId: string, taskId: string, commentId: string, userId: string, dto: UpdateCommentDto) {
        await this.getTaskOrThrow(orgId, taskId);

        const comment = await this.prisma.taskComment.findFirst({
            where: { taskId, id: commentId }
        });
        if (!comment) throw new NotFoundException('Comment not found');

        if (dto.content !== undefined && dto.content === comment.content) throw new BadRequestException('Comment content is the same as the current comment content');
        if (comment.userId !== userId) throw new ForbiddenException('You cannot edit this comment');

        const updatedComment = this.prisma.taskComment.update({ where: { taskId, id: commentId }, data: { ...dto } })

        if (!updatedComment) throw new Error('Failed to update comment immediately after update')
        this.taskGateway.emitCommentUpdated(orgId, updatedComment)

        return updatedComment
    }

    async removeComment(orgId: string, taskId: string, commentId: string, userId: string, userRole: string) {
        await this.getTaskOrThrow(orgId, taskId);

        const comment = await this.prisma.taskComment.findFirst({
            where: { taskId, id: commentId }
        });
        if (!comment) throw new NotFoundException('Comment not found');

        if (comment.userId !== userId) {
            const commentMember = await this.prisma.member.findFirst({
                where: { userId: comment.userId, organizationId: orgId }, select: { role: true }
            });

            if (!outranks(userRole, commentMember?.role ?? 'member')) {
                throw new ForbiddenException('Insufficient permissions to delete this comment');
            }
        }

        await this.prisma.taskComment.delete({
            where: { taskId, id: commentId }
        });

        this.taskGateway.emitCommentDeleted(orgId, commentId)
    }

    async addAttachment(orgId: string, taskId: string, userId: string, file: Express.Multer.File) {
        await this.getTaskOrThrow(orgId, taskId);

        const uploaded = await this.uploadService.uploadTaskAttachment(file, taskId);

        return this.prisma.taskAttachment.create({
            data: {
                taskId,
                fileUrl: uploaded.url,
                fileName: uploaded.fileName,
                fileSize: uploaded.fileSize,
                uploadedById: userId
            }
        })
    }

    async removeAttachment(orgId: string, taskId: string, attachmentId: string, userId: string, userRole: string) {
        await this.getTaskOrThrow(orgId, taskId);

        const attachment = await this.prisma.taskAttachment.findFirst({ where: { taskId, id: attachmentId } });
        if (!attachment) throw new NotFoundException('Attachment not found');

        if (attachment.uploadedById !== userId) {
            const attachmentMember = await this.prisma.member.findFirst({
                where: { userId: attachment.uploadedById, organizationId: orgId }, select: { role: true }
            });

            if (!outranks(userRole, attachmentMember?.role ?? 'member')) {
                throw new ForbiddenException('Insufficient permissions to delete this attachment');
            }
        }

        await this.uploadService.deleteFile(attachment.fileUrl);
        await this.prisma.taskAttachment.delete({ where: { taskId, id: attachmentId } });
    }

    private async getTaskOrThrow(orgId: string, taskId: string) {
        const task = await this.prisma.task.findFirst({ where: { id: taskId, organizationId: orgId } })
        if (!task) throw new NotFoundException('Task not found');
        return task;
    }
}
