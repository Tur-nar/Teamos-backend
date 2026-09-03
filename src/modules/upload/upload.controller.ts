import { Controller, Post, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { UploadService } from './upload.service';


@Controller('upload')
export class UploadController {
    constructor(private readonly uploadService: UploadService) { }

    @Post('avatar')
    @UseInterceptors(FileInterceptor('avatar'))
    async uploadAvatar(
        @UploadedFile() file: Express.Multer.File,
        @Session() session: UserSession,
    ) {
        const url = await this.uploadService.uploadAvatarOrLogo(file, session.user.id);
        return { url };
    }

    @Post('org-logo')
    @UseInterceptors(FileInterceptor('logo'))
    async uploadOrgLogo(
        @UploadedFile() file: Express.Multer.File,
    ) {
        const url = await this.uploadService.uploadOrgLogo(file);
        return { url };
    }
}
