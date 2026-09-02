jest.mock('@thallesp/nestjs-better-auth', () => ({
  Session: () => () => {},
  AllowAnonymous: () => () => {},
  UserSession: class {},
  AuthModule: { forRoot: jest.fn().mockReturnValue({ module: class {} }) },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

const mockUploadService = {
  uploadAvatarOrLogo: jest.fn(),
  uploadTaskAttachments: jest.fn(),
  uploadTargetAttachments: jest.fn(),
  deleteFile: jest.fn(),
};

describe('UploadController', () => {
  let controller: UploadController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [
        { provide: UploadService, useValue: mockUploadService },
      ],
    }).compile();

    controller = module.get<UploadController>(UploadController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
