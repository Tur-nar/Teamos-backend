import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

@Injectable()
export class UploadService {
    constructor(private readonly configService: ConfigService) {
        cloudinary.config({
            cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
            api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
            api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
        });
    }

    async uploadAvatarOrLogo(
        file: Express.Multer.File,
        userId: string,
    ): Promise<string> {
        if (!file) throw new BadRequestException('No file uploaded')

        const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "image/gif", "image/webp"]
        if (!allowedTypes.includes(file.mimetype)) throw new BadRequestException('Invalid file type. Allowed: JPEG, PNG, GIF, WEBP');

        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) throw new BadRequestException('File size must be less than 5MB');

        return new Promise<string>(async (resolve, reject) => {
            cloudinary.uploader.upload_stream({
                folder: 'team-os/avatars',
                public_id: `avatar_user_${userId}`,
                transformation: [
                    { width: 500, height: 500, crop: 'fill', gravity: 'face' },
                    { quality: 'auto', fetch_format: 'auto' }
                ]
            }, (error, result: UploadApiResponse | undefined) => {
                if (error) return reject(new BadRequestException('Upload failed: ' + error.message));
                if (result) return resolve(result.secure_url);
                reject(new BadRequestException('Upload failed: Unexpected error'));
            }).end(file.buffer);
        });
    }

    async uploadTaskAttachment(file: Express.Multer.File, taskId: string): Promise<{ url: string; fileName: string; fileSize: number }> {
        if (!file) throw new BadRequestException('No file uploaded');

        const allowTypes = [
            'image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp',
            'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain', 'application/zip', 'application/vnd.rar', 'application/x-tar',
        ];

        if (!allowTypes.includes(file.mimetype)) throw new BadRequestException('File type not allowed')

        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) throw new BadRequestException('File size must be less than 10MB');

        return new Promise<{ url: string; fileName: string; fileSize: number }>((resolve, reject) => {
            cloudinary.uploader.upload_stream({
                folder: `team-os/tasks/${taskId}`,
                resource_type: 'auto',
                public_id: file.originalname,
            }, (error, result: UploadApiResponse | undefined) => {
                if (error) return reject(new BadRequestException('Upload failed' + error.message));
                if (result) return resolve({
                    url: result.secure_url,
                    fileName: result.original_filename,
                    fileSize: result.bytes,
                });
                reject(new BadRequestException('Upload failed: Unexpected error'));
            }).end(file.buffer);
        });
    }

    async deleteFile(url: string) {
        const publicId = this.extractPublicIdFromUrl(url);
        if (!publicId) return;
        const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'auto' });
        if (result.result !== 'ok' && result.result !== 'not found') {
            throw new BadRequestException('Failed to delete file from storage');
        }
    }

    private extractPublicIdFromUrl(url: string): string | null {
        const urlObj = new URL(url);
        const match = urlObj.pathname.match(/\/v\d+\/(team-os\/tasks\/[^/]+\/[^/]+)$/);
        return match ? match[1] : null;  // "team-os/tasks/taskId/filename"
    }

}
