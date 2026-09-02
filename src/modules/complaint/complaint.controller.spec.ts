jest.mock('@thallesp/nestjs-better-auth', () => ({
  Session: () => () => {},
  AllowAnonymous: () => () => {},
  UserSession: {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ComplaintController } from './complaint.controller';
import { ComplaintService } from './complaint.service';
import { ComplaintCategory, ComplaintStatus, Priority, Role } from '@prisma/client';

const mockComplaintService = {
  create: jest.fn(),
  findAll: jest.fn(),
  getStats: jest.fn(),
  findOne: jest.fn(),
  updateStatus: jest.fn(),
  delete: jest.fn(),
};

const ORG_ID = 'org-1';
const USER_ID = 'user-member-1';
const SESSION = {
  user: { id: USER_ID, name: 'Member', email: 'mem@team.com' },
  session: { id: 'sess-1' },
} as any;

describe('ComplaintController', () => {
  let controller: ComplaintController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ComplaintController],
      providers: [
        {
          provide: ComplaintService,
          useValue: mockComplaintService,
        },
      ],
    }).compile();

    controller = module.get<ComplaintController>(ComplaintController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('delegates to complaintService.create with session user id (covers: AC-6)', async () => {
      const dto = {
        title: 'Network outage on floor 3',
        description: 'Wi-Fi drops every 5 minutes.',
        category: ComplaintCategory.BUG,
        priority: Priority.HIGH,
      };
      const expectedResult = { id: 'comp-1', ...dto };
      mockComplaintService.create.mockResolvedValue(expectedResult);

      const result = await controller.create(ORG_ID, SESSION, dto);

      expect(mockComplaintService.create).toHaveBeenCalledWith(ORG_ID, USER_ID, dto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('findAll', () => {
    it('delegates to complaintService.findAll with session user, role, and query (covers: AC-9)', async () => {
      const query = { page: 1, limit: 10, status: ComplaintStatus.OPEN };
      const expectedResult = { items: [], total: 0, page: 1, limit: 10, totalPages: 0 };
      mockComplaintService.findAll.mockResolvedValue(expectedResult);

      const result = await controller.findAll(ORG_ID, SESSION, Role.member, query);

      expect(mockComplaintService.findAll).toHaveBeenCalledWith(
        ORG_ID,
        USER_ID,
        Role.member,
        query,
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('getStats', () => {
    it('delegates to complaintService.getStats with role scoping (covers: AC-10)', async () => {
      const stats = { total: 5, open: 2, inReview: 1, late: 0, resolved: 2, dismissed: 0 };
      mockComplaintService.getStats.mockResolvedValue(stats);

      const result = await controller.getStats(ORG_ID, SESSION, Role.member);

      expect(mockComplaintService.getStats).toHaveBeenCalledWith(ORG_ID, USER_ID, Role.member);
      expect(result).toEqual(stats);
    });
  });

  describe('findOne', () => {
    it('delegates to complaintService.findOne with access parameters (covers: AC-9)', async () => {
      const expectedComplaint = { id: 'comp-1', title: 'Test issue' };
      mockComplaintService.findOne.mockResolvedValue(expectedComplaint);

      const result = await controller.findOne(ORG_ID, SESSION, Role.member, 'comp-1');

      expect(mockComplaintService.findOne).toHaveBeenCalledWith(
        ORG_ID,
        'comp-1',
        USER_ID,
        Role.member,
      );
      expect(result).toEqual(expectedComplaint);
    });
  });

  describe('updateStatus', () => {
    it('delegates to complaintService.updateStatus (covers: AC-7)', async () => {
      const dto = { status: ComplaintStatus.IN_REVIEW };
      const updatedComplaint = { id: 'comp-1', status: ComplaintStatus.IN_REVIEW };
      mockComplaintService.updateStatus.mockResolvedValue(updatedComplaint);

      const result = await controller.updateStatus(ORG_ID, SESSION, Role.member, 'comp-1', dto);

      expect(mockComplaintService.updateStatus).toHaveBeenCalledWith(
        ORG_ID,
        'comp-1',
        USER_ID,
        Role.member,
        dto,
      );
      expect(result).toEqual(updatedComplaint);
    });
  });

  describe('delete', () => {
    it('delegates to complaintService.delete with role check (covers: AC-11)', async () => {
      mockComplaintService.delete.mockResolvedValue({ deleted: true });

      const result = await controller.delete(ORG_ID, SESSION, Role.member, 'comp-1');

      expect(mockComplaintService.delete).toHaveBeenCalledWith(
        ORG_ID,
        'comp-1',
        USER_ID,
        Role.member,
      );
      expect(result).toEqual({ deleted: true });
    });
  });
});
