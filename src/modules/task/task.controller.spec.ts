jest.mock('@thallesp/nestjs-better-auth', () => ({
  Session: () => () => {},
  AllowAnonymous: () => () => {},
  UserSession: class {},
  AuthModule: { forRoot: jest.fn().mockReturnValue({ module: class {} }) },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';

const mockTaskService = {
  create: jest.fn(),
  findAll: jest.fn(),
  getStats: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  updateStatus: jest.fn(),
  delete: jest.fn(),
  createSubTask: jest.fn(),
  updateSubTask: jest.fn(),
  deleteSubTask: jest.fn(),
  reorderSubTasks: jest.fn(),
  createComment: jest.fn(),
  updateComment: jest.fn(),
  deleteComment: jest.fn(),
  uploadAttachment: jest.fn(),
  removeAttachment: jest.fn(),
};

describe('TaskController', () => {
  let controller: TaskController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TaskController],
      providers: [
        { provide: TaskService, useValue: mockTaskService },
      ],
    }).compile();

    controller = module.get<TaskController>(TaskController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
