import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './lib/prisma/prisma.module';
import { MailModule } from './lib/mail/mail.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { auth } from './lib/auth';
import { ResponseInterceptor } from './lib/common/interceptors/response-interceptors';
import { UserModule } from './modules/user/user.module';
import { RolesGuard } from './lib/common/guards/roles.guard';
import { DepartmentModule } from './modules/department/department.module';
import { UploadModule } from './modules/upload/upload.module';
import { TaskModule } from './modules/task/task.module';
import { TargetModule } from './modules/target/target.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
import { PerformanceModule } from './modules/performance/performance.module';
import { LlmModule } from './lib/llm/llm.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { GatewayModule } from './gateway/gateway.module';
import { ReviewModule } from './modules/review/review.module';
import { RecognitionModule } from './modules/recognition/recognition.module';
import { ComplaintModule } from './modules/complaint/complaint.module';
import { NotificationModule } from './modules/notification/notification.module';
import { AuditModule } from './lib/audit/audit.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';

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
    UploadModule,
    TaskModule,
    TargetModule,
    EventEmitterModule.forRoot(),
    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),
    PerformanceModule,
    LlmModule,
    SchedulerModule,
    GatewayModule,
    ReviewModule,
    RecognitionModule,
    ComplaintModule,
    NotificationModule,
    AuditModule,
    AuditLogModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [AppService, ResponseInterceptor, RolesGuard],
})
export class AppModule { }
