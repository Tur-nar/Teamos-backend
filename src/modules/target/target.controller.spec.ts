jest.mock('@thallesp/nestjs-better-auth', () => ({
  Session: () => () => {},
  AllowAnonymous: () => () => {},
  UserSession: class {},
  AuthModule: { forRoot: jest.fn().mockReturnValue({ module: class {} }) },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { TargetController } from './target.controller';
import { TargetService } from './target.service';

const mockTargetService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  addEntry: jest.fn(),
};

describe('TargetController', () => {
  let controller: TargetController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TargetController],
      providers: [
        { provide: TargetService, useValue: mockTargetService },
      ],
    }).compile();

    controller = module.get<TargetController>(TargetController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
