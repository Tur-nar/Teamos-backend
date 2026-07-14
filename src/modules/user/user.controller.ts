import { Controller, Get } from '@nestjs/common';
import { Session, AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
    constructor(private readonly userService: UserService) { }
    @Get('me')
    async getMe(@Session() session: UserSession) {
        return this.userService.getProfile(session.user.id);
    }
}
