import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../lib/prisma/prisma.service';
import { Complaint, ReviewType } from '@prisma/client';

const SESSION_COOKIE_NAME = 'better-auth.session_token';

function parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    for (const pair of cookieHeader.split(';')) {
        const eqIdx = pair.indexOf('=');
        if (eqIdx === -1) continue;
        const key = pair.substring(0, eqIdx).trim();
        const val = pair.substring(eqIdx + 1).trim();
        cookies[key] = decodeURIComponent(val);
    }
    return cookies;
}

const HEARTBEAT_INTERVAL_MS = 30_000;

interface VerifiedSession {
    userId: string;
    expiresAt: Date;
    activeOrganizationId: string | null;
}

@Injectable()
@WebSocketGateway({ cors: { origin: process.env.FRONTEND_URL, credentials: true } })
export class TaskGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
    private readonly logger = new Logger(TaskGateway.name);

    constructor(private readonly prisma: PrismaService) { }

    @WebSocketServer()
    server: Server;

    private connectedUsers = new Map<string, Set<string>>();
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private isHeartbeatRunning = false;

    private orgSyncInProgress = new Set<string>();

    afterInit() {
        this.heartbeatTimer = setInterval(() => this.heartbeat(), HEARTBEAT_INTERVAL_MS);
        this.logger.log(`Session heartbeat started (every ${HEARTBEAT_INTERVAL_MS / 1000}s)`);
    }

    onModuleDestroy() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    async handleConnection(client: Socket) {
        try {
            const cookieHeader = client.handshake.headers.cookie;
            if (!cookieHeader) {
                this.logger.warn(`Connection rejected: no cookies present [${client.id}]`);
                client.emit('auth:error', { message: 'Authentication required' });
                return client.disconnect(true);
            }

            const cookies = parseCookies(cookieHeader);
            const token = cookies[SESSION_COOKIE_NAME];
            if (!token) {
                this.logger.warn(`Connection rejected: session cookie missing [${client.id}]`);
                client.emit('auth:error', { message: 'Authentication required' });
                return client.disconnect(true);
            }

            const session = await this.prisma.session.findUnique({
                where: { token },
                select: {
                    userId: true,
                    expiresAt: true,
                    activeOrganizationId: true,
                },
            });

            if (!session) {
                this.logger.warn(`Connection rejected: invalid session token [${client.id}]`);
                client.emit('auth:error', { message: 'Invalid or expired session' });
                return client.disconnect(true);
            }

            if (session.expiresAt < new Date()) {
                this.logger.warn(`Connection rejected: expired session for user ${session.userId} [${client.id}]`);
                client.emit('auth:error', { message: 'Session expired' });
                return client.disconnect(true);
            }

            const orgId = session.activeOrganizationId;
            if (!orgId) {
                this.logger.warn(`Connection rejected: no active org for user ${session.userId} [${client.id}]`);
                client.emit('auth:error', { message: 'No active organization' });
                return client.disconnect(true);
            }

            const membership = await this.prisma.member.findFirst({
                where: { userId: session.userId, organizationId: orgId },
                select: { role: true },
            });

            if (!membership) {
                this.logger.warn(`Connection rejected: user ${session.userId} is not a member of org ${orgId} [${client.id}]`);
                client.emit('auth:error', { message: 'Not a member of this organization' });
                return client.disconnect(true);
            }

            client.data.userId = session.userId;
            client.data.orgId = orgId;
            client.data.role = membership.role;
            client.join(`org:${orgId}`);
            client.join(`user:${session.userId}`);

            if (!this.connectedUsers.has(session.userId)) {
                this.connectedUsers.set(session.userId, new Set());
            }
            this.connectedUsers.get(session.userId)!.add(client.id);

            this.logger.log(`User ${session.userId} connected to org ${orgId} as ${membership.role} [${client.id}]`);
        } catch (error) {
            this.logger.error(`Connection error [${client.id}]: ${error}`);
            client.emit('auth:error', { message: 'Authentication failed' });
            client.disconnect(true);
        }
    }

    handleDisconnect(client: Socket) {
        const userId = client.data?.userId as string | undefined;
        if (userId && this.connectedUsers.has(userId)) {
            this.connectedUsers.get(userId)!.delete(client.id);
            if (this.connectedUsers.get(userId)!.size === 0) this.connectedUsers.delete(userId);
        }
        this.orgSyncInProgress.delete(client.id);
    }

    @SubscribeMessage('org:switch')
    async handleOrgSwitch(client: Socket) {
        try {
            const token = this.extractToken(client);
            if (!token) return this.kick(client, 'Authentication required');

            const session = await this.prisma.session.findUnique({
                where: { token },
                select: { userId: true, expiresAt: true, activeOrganizationId: true },
            });

            if (!session || session.expiresAt < new Date()) return this.kick(client, 'Session expired');

            await this.syncSocketOrg(client, session);
        } catch (error) {
            this.logger.error(`Org switch error [${client.id}]: ${error}`);
            this.kick(client, 'Organization switch failed');
        }
    }

    disconnectUser(userId: string) {
        const socketIds = this.connectedUsers.get(userId);
        if (!socketIds) return;

        for (const socketId of socketIds) {
            const socket = this.server.sockets.sockets.get(socketId);
            if (socket) {
                socket.emit('auth:error', { message: 'Session invalidated' });
                socket.disconnect(true);
            }
        }
        this.connectedUsers.delete(userId);
        this.logger.log(`Disconnected all sockets for user ${userId} (logout)`);
    }

    private async heartbeat() {
        if (this.isHeartbeatRunning) return;
        this.isHeartbeatRunning = true;

        try {
            const sockets = this.server?.sockets?.sockets;
            if (!sockets || sockets.size === 0) return;

            const socketList = [...sockets.values()];
            const tokens = socketList.map(s => this.extractToken(s)).filter((t): t is string => !!t);

            const sessions = await this.prisma.session.findMany({
                where: { token: { in: tokens } },
                select: { token: true, userId: true, expiresAt: true, activeOrganizationId: true },
            });
            const sessionByToken = new Map(sessions.map(s => [s.token, s]));

            for (const socket of socketList) {
                const token = this.extractToken(socket);
                const session = token ? sessionByToken.get(token) : null;

                if (!session || session.expiresAt < new Date()) {
                    this.logger.log(`Heartbeat: session gone/expired, disconnecting [${socket.id}]`);
                    this.kick(socket, 'Session expired');
                    continue;
                }

                await this.syncSocketOrg(socket, session);
            }
        } finally {
            this.isHeartbeatRunning = false;
        }
    }

    private async syncSocketOrg(socket: Socket, session: VerifiedSession): Promise<void> {
        if (this.orgSyncInProgress.has(socket.id)) return;
        this.orgSyncInProgress.add(socket.id);

        try {
            const newOrgId = session.activeOrganizationId;
            if (!newOrgId) return this.kick(socket, 'No active organization');

            const currentOrgId = socket.data.orgId as string | undefined;
            if (currentOrgId === newOrgId) return; // already in sync, nothing to do

            const membership = await this.prisma.member.findFirst({
                where: { userId: session.userId, organizationId: newOrgId },
                select: { role: true },
            });
            if (!membership) return this.kick(socket, 'Not a member of this organization');

            if (currentOrgId) {
                socket.leave(`org:${currentOrgId}`);
                this.logger.log(`User ${session.userId} left org room ${currentOrgId} [${socket.id}]`);
            }

            socket.join(`org:${newOrgId}`);
            socket.data.orgId = newOrgId;
            socket.data.role = membership.role;

            socket.emit('org:switched', { orgId: newOrgId, role: membership.role });
            this.logger.log(`User ${session.userId} synced to org ${newOrgId} as ${membership.role} [${socket.id}]`);
        } finally {
            this.orgSyncInProgress.delete(socket.id);
        }
    }

    private extractToken(client: Socket): string | null {
        const cookieHeader = client.handshake.headers.cookie;
        if (!cookieHeader) return null;
        const cookies = parseCookies(cookieHeader);
        return cookies[SESSION_COOKIE_NAME] || null;
    }

    private kick(client: Socket, message: string) {
        client.emit('auth:error', { message });
        client.disconnect(true);
    }

    emitTaskCreated(orgId: string, task: any) { this.server.to(`org:${orgId}`).emit('task:created', task); }
    emitTaskUpdated(orgId: string, task: any) { this.server.to(`org:${orgId}`).emit('task:updated', task); }
    emitTaskStatusChanged(orgId: string, taskId: string, status: any) { this.server.to(`org:${orgId}`).emit('task:status-changed', { taskId, status }); }
    emitTaskDeleted(orgId: string, taskId: string) { this.server.to(`org:${orgId}`).emit('task:deleted', taskId); }
    emitSubTaskAdded(orgId: string, subtask: any) { this.server.to(`org:${orgId}`).emit('subTask:added', subtask); }
    emitSubTaskUpdated(orgId: string, subtask: any) { this.server.to(`org:${orgId}`).emit('subTask:updated', subtask); }
    emitSubTaskDeleted(orgId: string, subtaskId: string) { this.server.to(`org:${orgId}`).emit('subTask:deleted', subtaskId); }
    emitCommentAdded(orgId: string, comment: any) { this.server.to(`org:${orgId}`).emit('comment:added', comment); }
    emitCommentDeleted(orgId: string, commentId: string) { this.server.to(`org:${orgId}`).emit('comment:deleted', commentId); }
    emitCommentUpdated(orgId: string, comment: any) { this.server.to(`org:${orgId}`).emit('comment:updated', comment); }
    emitTargetCreated(orgId: string, target: any) { this.server.to(`org:${orgId}`).emit('target:created', target); }
    emitTargetUpdated(orgId: string, target: any) { this.server.to(`org:${orgId}`).emit('target:updated', target); }
    emitTargetDeleted(orgId: string, targetId: string) { this.server.to(`org:${orgId}`).emit('target:deleted', targetId); }
    emitTargetEntryAdded(orgId: string, entry: any) { this.server.to(`org:${orgId}`).emit('targetEntry:added', entry); }
    emitTargetEntryDeleted(orgId: string, { entryId, updatedTarget }: { entryId: string, updatedTarget: any }) {
        this.server.to(`org:${orgId}`).emit('targetEntry:deleted', { entryId, updatedTarget });
    }
    emitPerformanceUpdated(orgId: string, record: any) { this.server.to(`org:${orgId}`).emit('performance:updated', record); }
    emitInsightGenerated(orgId: string, insight: any) { this.server.to(`org:${orgId}`).emit('insight:generated', insight); }
    emitReviewAssigned(orgId: string, { cycleId, cycleName, reviewCount }: { cycleId: string, cycleName: string, reviewCount: number }) {
        this.server.to(`org:${orgId}`).emit('review:assigned', { cycleId, cycleName, reviewCount });
    }
    emitReviewSubmitted(orgId: string, review: { reviewId: string, cycleId: string, revieweeId: string, type: ReviewType }) {
        this.server.to(`org:${orgId}`).emit('review:submitted', review);
    }
    emitCalibrationCompleted(orgId: string, { sessionId, cycleId, departmentId }: { sessionId: string, cycleId: string, departmentId: string }) {
        this.server.to(`org:${orgId}`).emit('calibration:completed', { sessionId, cycleId, departmentId });
    }
    emitReviewOverdue(orgId: string, { cycleId, overdueCount }: { cycleId: string, overdueCount: number }) {
        this.server.to(`org:${orgId}`).emit('review:overdue', { cycleId, overdueCount });
    }
    emitComplaintCreated(orgId: string, complaint: any) { this.server.to(`org:${orgId}`).emit('complaint:created', complaint); }
    emitComplaintStatusChanged(orgId: string, { complaintId, status, resolvedById }: { complaintId: string, status: string, resolvedById: string | null }) {
        this.server.to(`org:${orgId}`).emit('complaint:status-changed', { complaintId, status, resolvedById })
    }
    emitComplaintDeleted(orgId: string, complaintId: string) { this.server.to(`org:${orgId}`).emit('complaint:deleted', complaintId); }
    emitComplaintLate(orgId, { complaintId, title }: { complaintId: string, title: string }) {
        this.server.to(`org:${orgId}`).emit('complaint:late', { complaintId, title })
    }
    emitNotification(orgId: string, userId: string, notification: any) { this.server.to(`org:${orgId}`).emit(`user:${userId}:notification`, notification); }
}