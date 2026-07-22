import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './lib/prisma/prisma.module';
import { MailModule } from './lib/mail/mail.module';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { auth } from './lib/auth';
import { ResponseInterceptor } from './lib/common/interceptors/response-interceptors';
import { UserModule } from './modules/user/user.module';
import { RolesGuard } from './lib/common/guards/roles.guard';
import { DepartmentModule } from './modules/department/department.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    MailModule,
    AuthModule.forRoot({ auth }),
    UserModule,
    DepartmentModule,
  ],
  controllers: [AppController],
  providers: [AppService, ResponseInterceptor, RolesGuard],
})
export class AppModule { }
