import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './lib/common/interceptors/response-interceptors';
import { HttpExceptionFilter } from './lib/common/filters/http-exception.filter';
import { RolesGuard } from './lib/common/guards/roles.guard';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false
  });
  app.use(helmet());

  app.setGlobalPrefix('/api/v1');

  app.enableCors({
    origin: process.env.FRONTEND_URL?.split(',').map((o) => o.trim()).filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-org-id'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(app.get(ResponseInterceptor));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalGuards(app.get(RolesGuard));

  // await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
  await app.listen(process.env.PORT ?? 3000);

}
bootstrap();
