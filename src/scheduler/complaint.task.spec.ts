import { ComplaintCronTask } from './complaint.task';

const mockComplaintService = {
  markLateComplaints: jest.fn(),
};

describe('ComplaintCronTask', () => {
  let cronTask: ComplaintCronTask;

  beforeEach(() => {
    jest.clearAllMocks();
    cronTask = new ComplaintCronTask(mockComplaintService as any);
  });

  it('should be defined', () => {
    expect(cronTask).toBeDefined();
  });

  describe('handleLateComplaintDetection', () => {
    it('calls complaintService.markLateComplaints and handles positive marked count (covers: AC-8)', async () => {
      mockComplaintService.markLateComplaints.mockResolvedValue(3);

      await cronTask.handleLateComplaintDetection();

      expect(mockComplaintService.markLateComplaints).toHaveBeenCalledTimes(1);
    });

    it('handles zero marked complaints cleanly (covers: AC-8)', async () => {
      mockComplaintService.markLateComplaints.mockResolvedValue(0);

      await cronTask.handleLateComplaintDetection();

      expect(mockComplaintService.markLateComplaints).toHaveBeenCalledTimes(1);
    });

    it('catches errors gracefully without throwing an unhandled exception', async () => {
      mockComplaintService.markLateComplaints.mockRejectedValue(new Error('Database connectivity error'));

      await expect(cronTask.handleLateComplaintDetection()).resolves.not.toThrow();
    });
  });
});
