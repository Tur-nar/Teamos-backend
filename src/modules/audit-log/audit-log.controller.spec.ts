import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogController } from './audit-log.controller';
import { AuditLogQueryService } from './audit-log.service';
import { Response } from 'express';

describe('AuditLogController', () => {
  let controller: AuditLogController;
  let service: AuditLogQueryService;

  const mockAuditLogQueryService = {
    findAll: jest.fn(),
    exportCsv: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditLogController],
      providers: [
        {
          provide: AuditLogQueryService,
          useValue: mockAuditLogQueryService,
        },
      ],
    }).compile();

    controller = module.get<AuditLogController>(AuditLogController);
    service = module.get<AuditLogQueryService>(AuditLogQueryService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call findAll with orgId and query', async () => {
    const expected = { items: [], total: 0, page: 1, limit: 20, totalPages: 0 };
    mockAuditLogQueryService.findAll.mockResolvedValueOnce(expected);

    const query = { page: 1, limit: 20 };
    const result = await controller.findAll('org-1', query);

    expect(mockAuditLogQueryService.findAll).toHaveBeenCalledWith('org-1', query);
    expect(result).toEqual(expected);
  });

  it('should export CSV and set correct headers', async () => {
    const csvContent = 'Date,User,Action\n2026-09-01,Alice,ROLE_CHANGED';
    mockAuditLogQueryService.exportCsv.mockResolvedValueOnce(csvContent);

    const mockRes = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as unknown as Response;

    const query = { action: 'ROLE_CHANGED' };
    await controller.exportCsv('org-1', query, mockRes);

    expect(mockAuditLogQueryService.exportCsv).toHaveBeenCalledWith('org-1', query);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename=audit-logs.csv');
    expect(mockRes.send).toHaveBeenCalledWith(csvContent);
  });
});
