import { Test, TestingModule } from '@nestjs/testing';
import { UploadService } from './upload.service';

import { ConfigService } from '@nestjs/config';

describe('UploadService', () => {
  let service: UploadService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'CLOUDINARY_CLOUD_NAME') return 'test-cloud';
              if (key === 'CLOUDINARY_API_KEY') return 'test-key';
              if (key === 'CLOUDINARY_API_SECRET') return 'test-secret';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<UploadService>(UploadService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
