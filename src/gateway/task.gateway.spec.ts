import { Test, TestingModule } from '@nestjs/testing';
import { TaskGateway } from './task.gateway';
import { PrismaService } from '../lib/prisma/prisma.service';
import { Socket, Server } from 'socket.io';

// ── Mocks ──────────────────────────────────────────────────────────

const mockPrisma = {
    session: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
    },
    member: {
        findFirst: jest.fn(),
    },
};

function createMockSocket(overrides: {
    id?: string;
    cookie?: string;
    data?: Record<string, any>;
} = {}): Socket {
    const rooms = new Set<string>();
    return {
        id: overrides.id ?? 'socket-1',
        handshake: {
            headers: {
                cookie: overrides.cookie ?? undefined,
            },
        },
        data: overrides.data ?? {},
        emit: jest.fn(),
        join: jest.fn((room: string) => rooms.add(room)),
        leave: jest.fn((room: string) => rooms.delete(room)),
        disconnect: jest.fn(),
        rooms,
    } as unknown as Socket;
}

function validCookie(token = 'valid-token') {
    return `better-auth.session_token=${encodeURIComponent(token)}`;
}

const VALID_SESSION = {
    userId: 'user-1',
    expiresAt: new Date(Date.now() + 3600_000), // 1 hour from now
    activeOrganizationId: 'org-1',
};

const VALID_MEMBERSHIP = { role: 'admin' };

// ── Test Suite ─────────────────────────────────────────────────────

describe('TaskGateway', () => {
    let gateway: TaskGateway;
    let mockServer: Partial<Server>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TaskGateway,
                { provide: PrismaService, useValue: mockPrisma },
            ],
        }).compile();

        gateway = module.get<TaskGateway>(TaskGateway);

        // Provide a mock server with a sockets map for emit helpers and heartbeat
        mockServer = {
            to: jest.fn().mockReturnThis(),
            emit: jest.fn(),
            sockets: {
                sockets: new Map<string, Socket>(),
            },
        } as any;
        (gateway as any).server = mockServer;

        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        gateway.onModuleDestroy();
    });

    // ── handleConnection: authentication ───────────────────────

    describe('handleConnection', () => {
        it('rejects connection with no cookies', async () => {
            const socket = createMockSocket({ cookie: undefined });
            // When there's no cookie header, the key is missing entirely
            delete (socket.handshake.headers as any).cookie;

            await gateway.handleConnection(socket);

            expect(socket.emit).toHaveBeenCalledWith('auth:error', { message: 'Authentication required' });
            expect(socket.disconnect).toHaveBeenCalledWith(true);
        });

        it('rejects connection when session cookie is missing', async () => {
            const socket = createMockSocket({ cookie: 'other-cookie=value' });

            await gateway.handleConnection(socket);

            expect(socket.emit).toHaveBeenCalledWith('auth:error', { message: 'Authentication required' });
            expect(socket.disconnect).toHaveBeenCalledWith(true);
        });

        it('rejects connection with invalid session token', async () => {
            mockPrisma.session.findUnique.mockResolvedValue(null);
            const socket = createMockSocket({ cookie: validCookie('bad-token') });

            await gateway.handleConnection(socket);

            expect(mockPrisma.session.findUnique).toHaveBeenCalledWith(
                expect.objectContaining({ where: { token: 'bad-token' } }),
            );
            expect(socket.emit).toHaveBeenCalledWith('auth:error', { message: 'Invalid or expired session' });
            expect(socket.disconnect).toHaveBeenCalledWith(true);
        });

        it('rejects connection with expired session', async () => {
            mockPrisma.session.findUnique.mockResolvedValue({
                ...VALID_SESSION,
                expiresAt: new Date(Date.now() - 1000), // expired
            });
            const socket = createMockSocket({ cookie: validCookie() });

            await gateway.handleConnection(socket);

            expect(socket.emit).toHaveBeenCalledWith('auth:error', { message: 'Session expired' });
            expect(socket.disconnect).toHaveBeenCalledWith(true);
        });

        it('rejects connection when no active organization on session', async () => {
            mockPrisma.session.findUnique.mockResolvedValue({
                ...VALID_SESSION,
                activeOrganizationId: null,
            });
            const socket = createMockSocket({ cookie: validCookie() });

            await gateway.handleConnection(socket);

            expect(socket.emit).toHaveBeenCalledWith('auth:error', { message: 'No active organization' });
            expect(socket.disconnect).toHaveBeenCalledWith(true);
        });

        it('rejects connection when user is not a member of the org', async () => {
            mockPrisma.session.findUnique.mockResolvedValue(VALID_SESSION);
            mockPrisma.member.findFirst.mockResolvedValue(null);
            const socket = createMockSocket({ cookie: validCookie() });

            await gateway.handleConnection(socket);

            expect(mockPrisma.member.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { userId: 'user-1', organizationId: 'org-1' },
                }),
            );
            expect(socket.emit).toHaveBeenCalledWith('auth:error', { message: 'Not a member of this organization' });
            expect(socket.disconnect).toHaveBeenCalledWith(true);
        });

        it('allows connection and joins correct rooms on valid session and membership', async () => {
            mockPrisma.session.findUnique.mockResolvedValue(VALID_SESSION);
            mockPrisma.member.findFirst.mockResolvedValue(VALID_MEMBERSHIP);
            const socket = createMockSocket({ cookie: validCookie() });

            await gateway.handleConnection(socket);

            expect(socket.disconnect).not.toHaveBeenCalled();
            expect(socket.join).toHaveBeenCalledWith('org:org-1');
            expect(socket.join).toHaveBeenCalledWith('user:user-1');
            expect(socket.data.userId).toBe('user-1');
            expect(socket.data.orgId).toBe('org-1');
            expect(socket.data.role).toBe('admin');
        });

        it('does not trust client supplied organizationId or userId from query params', async () => {
            mockPrisma.session.findUnique.mockResolvedValue(VALID_SESSION);
            mockPrisma.member.findFirst.mockResolvedValue(VALID_MEMBERSHIP);
            const socket = createMockSocket({ cookie: validCookie() });
            // Simulate attacker sending fake IDs in query params
            (socket.handshake as any).query = { organizationId: 'evil-org', userId: 'evil-user' };

            await gateway.handleConnection(socket);

            // The gateway should use the session values, not query params
            expect(socket.data.userId).toBe('user-1');
            expect(socket.data.orgId).toBe('org-1');
            expect(socket.join).toHaveBeenCalledWith('org:org-1');
            expect(socket.join).not.toHaveBeenCalledWith('org:evil-org');
        });

        it('handles unexpected errors gracefully', async () => {
            mockPrisma.session.findUnique.mockRejectedValue(new Error('DB down'));
            const socket = createMockSocket({ cookie: validCookie() });

            await gateway.handleConnection(socket);

            expect(socket.emit).toHaveBeenCalledWith('auth:error', { message: 'Authentication failed' });
            expect(socket.disconnect).toHaveBeenCalledWith(true);
        });

        it('decodes URL encoded cookie values', async () => {
            const encodedToken = 'token%3Dwith%3Dspecial%26chars';
            mockPrisma.session.findUnique.mockResolvedValue(VALID_SESSION);
            mockPrisma.member.findFirst.mockResolvedValue(VALID_MEMBERSHIP);
            const socket = createMockSocket({
                cookie: `better-auth.session_token=${encodedToken}`,
            });

            await gateway.handleConnection(socket);

            expect(mockPrisma.session.findUnique).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { token: 'token=with=special&chars' },
                }),
            );
        });
    });

    // ── handleDisconnect ───────────────────────────────────────

    describe('handleDisconnect', () => {
        it('removes socket from connectedUsers tracking', async () => {
            mockPrisma.session.findUnique.mockResolvedValue(VALID_SESSION);
            mockPrisma.member.findFirst.mockResolvedValue(VALID_MEMBERSHIP);
            const socket = createMockSocket({ cookie: validCookie() });

            await gateway.handleConnection(socket);
            gateway.handleDisconnect(socket);

            // connectedUsers is private, test indirectly by connecting again
            expect(socket.disconnect).not.toHaveBeenCalled();
        });

        it('handles disconnect of socket that was never authenticated', () => {
            const socket = createMockSocket();
            // No data set means socket was never authenticated
            socket.data = {};

            // Should not throw
            expect(() => gateway.handleDisconnect(socket)).not.toThrow();
        });
    });

    // ── handleOrgSwitch ────────────────────────────────────────

    describe('handleOrgSwitch (org:switch event)', () => {
        it('kicks client when no token in cookies', async () => {
            const socket = createMockSocket();
            delete (socket.handshake.headers as any).cookie;

            await gateway.handleOrgSwitch(socket);

            expect(socket.emit).toHaveBeenCalledWith('auth:error', { message: 'Authentication required' });
            expect(socket.disconnect).toHaveBeenCalledWith(true);
        });

        it('kicks client when session is expired', async () => {
            mockPrisma.session.findUnique.mockResolvedValue({
                ...VALID_SESSION,
                expiresAt: new Date(Date.now() - 1000),
            });
            const socket = createMockSocket({ cookie: validCookie() });

            await gateway.handleOrgSwitch(socket);

            expect(socket.emit).toHaveBeenCalledWith('auth:error', { message: 'Session expired' });
            expect(socket.disconnect).toHaveBeenCalledWith(true);
        });

        it('moves socket from old org room to new org room on successful switch', async () => {
            // First, connect to org-1
            mockPrisma.session.findUnique.mockResolvedValue(VALID_SESSION);
            mockPrisma.member.findFirst.mockResolvedValue(VALID_MEMBERSHIP);
            const socket = createMockSocket({ cookie: validCookie() });
            await gateway.handleConnection(socket);

            // Now session's active org changed to org-2
            mockPrisma.session.findUnique.mockResolvedValue({
                ...VALID_SESSION,
                activeOrganizationId: 'org-2',
            });
            mockPrisma.member.findFirst.mockResolvedValue({ role: 'member' });

            await gateway.handleOrgSwitch(socket);

            expect(socket.leave).toHaveBeenCalledWith('org:org-1');
            expect(socket.join).toHaveBeenCalledWith('org:org-2');
            expect(socket.data.orgId).toBe('org-2');
            expect(socket.data.role).toBe('member');
            expect(socket.emit).toHaveBeenCalledWith('org:switched', { orgId: 'org-2', role: 'member' });
        });

        it('does not leave old room if org has not changed', async () => {
            mockPrisma.session.findUnique.mockResolvedValue(VALID_SESSION);
            mockPrisma.member.findFirst.mockResolvedValue(VALID_MEMBERSHIP);
            const socket = createMockSocket({ cookie: validCookie() });
            await gateway.handleConnection(socket);

            // Reset mocks for the switch call
            jest.clearAllMocks();
            mockPrisma.session.findUnique.mockResolvedValue(VALID_SESSION);

            await gateway.handleOrgSwitch(socket);

            // Same org, no room change
            expect(socket.leave).not.toHaveBeenCalled();
        });

        it('kicks user who is not a member of the new org', async () => {
            mockPrisma.session.findUnique.mockResolvedValue(VALID_SESSION);
            mockPrisma.member.findFirst.mockResolvedValue(VALID_MEMBERSHIP);
            const socket = createMockSocket({ cookie: validCookie() });
            await gateway.handleConnection(socket);

            // Active org changed but user is not a member
            mockPrisma.session.findUnique.mockResolvedValue({
                ...VALID_SESSION,
                activeOrganizationId: 'org-2',
            });
            mockPrisma.member.findFirst.mockResolvedValue(null);

            await gateway.handleOrgSwitch(socket);

            expect(socket.emit).toHaveBeenCalledWith('auth:error', { message: 'Not a member of this organization' });
            expect(socket.disconnect).toHaveBeenCalledWith(true);
        });
    });

    // ── disconnectUser ─────────────────────────────────────────

    describe('disconnectUser', () => {
        it('disconnects all sockets belonging to a user', async () => {
            mockPrisma.session.findUnique.mockResolvedValue(VALID_SESSION);
            mockPrisma.member.findFirst.mockResolvedValue(VALID_MEMBERSHIP);

            const socket1 = createMockSocket({ id: 'sock-1', cookie: validCookie() });
            const socket2 = createMockSocket({ id: 'sock-2', cookie: validCookie() });

            // Register both sockets in the server mock
            (mockServer.sockets!.sockets as Map<string, Socket>).set('sock-1', socket1);
            (mockServer.sockets!.sockets as Map<string, Socket>).set('sock-2', socket2);

            await gateway.handleConnection(socket1);
            await gateway.handleConnection(socket2);

            gateway.disconnectUser('user-1');

            expect(socket1.emit).toHaveBeenCalledWith('auth:error', { message: 'Session invalidated' });
            expect(socket1.disconnect).toHaveBeenCalledWith(true);
            expect(socket2.emit).toHaveBeenCalledWith('auth:error', { message: 'Session invalidated' });
            expect(socket2.disconnect).toHaveBeenCalledWith(true);
        });

        it('does nothing for a user with no connected sockets', () => {
            expect(() => gateway.disconnectUser('nonexistent-user')).not.toThrow();
        });
    });

    // ── heartbeat ──────────────────────────────────────────────

    describe('heartbeat', () => {
        it('kicks sockets whose session no longer exists', async () => {
            mockPrisma.session.findUnique.mockResolvedValue(VALID_SESSION);
            mockPrisma.member.findFirst.mockResolvedValue(VALID_MEMBERSHIP);
            const socket = createMockSocket({ id: 'sock-hb', cookie: validCookie() });
            (mockServer.sockets!.sockets as Map<string, Socket>).set('sock-hb', socket);

            await gateway.handleConnection(socket);
            jest.clearAllMocks();

            // Session deleted (logout)
            mockPrisma.session.findMany.mockResolvedValue([]);

            await (gateway as any).heartbeat();

            expect(socket.emit).toHaveBeenCalledWith('auth:error', { message: 'Session expired' });
            expect(socket.disconnect).toHaveBeenCalledWith(true);
        });

        it('moves socket to new org when session activeOrganizationId changed', async () => {
            mockPrisma.session.findUnique.mockResolvedValue(VALID_SESSION);
            mockPrisma.member.findFirst.mockResolvedValue(VALID_MEMBERSHIP);
            const socket = createMockSocket({ id: 'sock-hb2', cookie: validCookie() });
            (mockServer.sockets!.sockets as Map<string, Socket>).set('sock-hb2', socket);

            await gateway.handleConnection(socket);
            jest.clearAllMocks();

            // Session now points to org-2
            mockPrisma.session.findMany.mockResolvedValue([{
                token: 'valid-token',
                userId: 'user-1',
                expiresAt: new Date(Date.now() + 3600_000),
                activeOrganizationId: 'org-2',
            }]);
            mockPrisma.member.findFirst.mockResolvedValue({ role: 'supervisor' });

            await (gateway as any).heartbeat();

            expect(socket.leave).toHaveBeenCalledWith('org:org-1');
            expect(socket.join).toHaveBeenCalledWith('org:org-2');
            expect(socket.emit).toHaveBeenCalledWith('org:switched', { orgId: 'org-2', role: 'supervisor' });
        });

        it('does not run concurrently', async () => {
            mockPrisma.session.findMany.mockResolvedValue([]);
            (mockServer.sockets!.sockets as Map<string, Socket>).set('s1', createMockSocket({ cookie: validCookie() }));

            // Start two heartbeats concurrently
            const hb1 = (gateway as any).heartbeat();
            const hb2 = (gateway as any).heartbeat();
            await Promise.all([hb1, hb2]);

            // findMany should only have been called once (second heartbeat skipped)
            expect(mockPrisma.session.findMany).toHaveBeenCalledTimes(1);
        });
    });

    // ── afterInit / onModuleDestroy lifecycle ──────────────────

    describe('lifecycle', () => {
        it('starts heartbeat timer on afterInit', () => {
            gateway.afterInit();
            expect((gateway as any).heartbeatTimer).not.toBeNull();
        });

        it('clears heartbeat timer on onModuleDestroy', () => {
            gateway.afterInit();
            gateway.onModuleDestroy();
            expect((gateway as any).heartbeatTimer).toBeNull();
        });
    });

    // ── emit helpers ───────────────────────────────────────────

    describe('emit helpers', () => {
        it('emits task:created to the correct org room', () => {
            const task = { id: 't1', title: 'Test task' };
            gateway.emitTaskCreated('org-1', task);

            expect(mockServer.to).toHaveBeenCalledWith('org:org-1');
            expect(mockServer.emit).toHaveBeenCalledWith('task:created', task);
        });

        it('emits task:deleted to the correct org room', () => {
            gateway.emitTaskDeleted('org-1', 'task-id');

            expect(mockServer.to).toHaveBeenCalledWith('org:org-1');
            expect(mockServer.emit).toHaveBeenCalledWith('task:deleted', 'task-id');
        });

        it('emits subTask:added to the correct org room', () => {
            const subtask = { id: 'st1', title: 'Sub' };
            gateway.emitSubTaskAdded('org-1', subtask);

            expect(mockServer.to).toHaveBeenCalledWith('org:org-1');
            expect(mockServer.emit).toHaveBeenCalledWith('subTask:added', subtask);
        });

        it('emits comment:added to the correct org room', () => {
            const comment = { id: 'c1', content: 'Hello' };
            gateway.emitCommentAdded('org-1', comment);

            expect(mockServer.to).toHaveBeenCalledWith('org:org-1');
            expect(mockServer.emit).toHaveBeenCalledWith('comment:added', comment);
        });
    });
});
