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

    // async uploadFile(file: Express.Multer.File): Promise<UploadApiResponse> {
    //     try {
    //         const uploadResult = await cloudinary.uploader.upload(file.path);
    //         return uploadResult;
    //     } catch (error) {
    //         throw new BadRequestException(error.message);
    //     }
    // }
}
