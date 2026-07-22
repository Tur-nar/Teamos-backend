import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';

jest.mock('@thallesp/nestjs-better-auth', () => ({
    Session: () => () => { },
    AllowAnonymous: () => () => { },
}));

const mockUserService = {
    getAllProfile: jest.fn(),
    getProfile: jest.fn(),
    findAllMembersOfOrganization: jest.fn(),
    findSupervisors: jest.fn(),
    getTeam: jest.fn(),
    updateProfile: jest.fn(),
    reassignTeam: jest.fn(),
};

describe('UserController', () => {
    let controller: UserController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [UserController],
            providers: [
                { provide: UserService, useValue: mockUserService },
            ],
        }).compile();

        controller = module.get<UserController>(UserController);
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('getAll', () => {
        it('delegates to userService.getAllProfile with the session user id', async () => {
            const session = { user: { id: 'u1' } } as any;
            mockUserService.getAllProfile.mockResolvedValue({ id: 'u1', name: 'Alice' });

            const result = await controller.getAll(session);

            expect(mockUserService.getAllProfile).toHaveBeenCalledWith('u1');
            expect(result.id).toBe('u1');
        });
    });

    describe('getMe', () => {
        it('delegates to userService.getProfile with userId and orgId', async () => {
            const session = { user: { id: 'u1' } } as any;
            mockUserService.getProfile.mockResolvedValue({ id: 'u1', activeRole: 'admin' });

            const result = await controller.getMe(session, 'org-1');

            expect(mockUserService.getProfile).toHaveBeenCalledWith('u1', 'org-1');
            expect(result.activeRole).toBe('admin');
        });
    });

    describe('findAll', () => {
        it('passes filters to the service', async () => {
            mockUserService.findAllMembersOfOrganization.mockResolvedValue([]);

            await controller.findAll('org-1', 'admin', 'dept-1', 'active');

            expect(mockUserService.findAllMembersOfOrganization).toHaveBeenCalledWith(
                'org-1',
                { role: 'admin', departmentId: 'dept-1', status: 'active' },
            );
        });

        it('passes undefined for omitted filters', async () => {
            mockUserService.findAllMembersOfOrganization.mockResolvedValue([]);

            await controller.findAll('org-1');

            expect(mockUserService.findAllMembersOfOrganization).toHaveBeenCalledWith(
                'org-1',
                { role: undefined, departmentId: undefined, status: undefined },
            );
        });
    });

    describe('findSupervisors', () => {
        it('delegates to userService.findSupervisors with orgId', async () => {
            mockUserService.findSupervisors.mockResolvedValue([{ id: 'sup-1', teamSize: 3 }]);

            const result = await controller.findSupervisors('org-1');

            expect(mockUserService.findSupervisors).toHaveBeenCalledWith('org-1');
            expect(result).toHaveLength(1);
        });
    });

    describe('getTeam', () => {
        it('delegates to userService.getTeam with orgId and supervisorId', async () => {
            mockUserService.getTeam.mockResolvedValue([{ id: 'u1' }]);

            const result = await controller.getTeam('org-1', 'sup-1');

            expect(mockUserService.getTeam).toHaveBeenCalledWith('org-1', 'sup-1');
            expect(result).toHaveLength(1);
        });
    });

    describe('updateProfile', () => {
        it('delegates to userService.updateProfile with orgId, userId, and dto', async () => {
            const dto = { departmentId: 'dept-1' };
            mockUserService.updateProfile.mockResolvedValue({ departmentId: 'dept-1' });

            const result = await controller.updateProfile('org-1', 'u1', dto as any);

            expect(mockUserService.updateProfile).toHaveBeenCalledWith('org-1', 'u1', dto);
        });
    });

    describe('reassignTeam', () => {
        it('delegates to userService.reassignTeam with orgId, supervisorId, and dto', async () => {
            const dto = { targetSupervisorId: 'sup-2' };
            mockUserService.reassignTeam.mockResolvedValue({ reassignedCount: 5 });

            const result = await controller.reassignTeam('org-1', 'sup-1', dto as any);

            expect(mockUserService.reassignTeam).toHaveBeenCalledWith('org-1', 'sup-1', dto);
            expect(result.reassignedCount).toBe(5);
        });
    });
});
