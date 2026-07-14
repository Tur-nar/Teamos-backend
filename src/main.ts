import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './lib/common/interceptors/response-interceptors';
import { HttpExceptionFilter } from './lib/common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false
  });

  // Security — helmet before anything else (AGENTS.md §8)
  app.use(helmet());

  app.setGlobalPrefix('/api/v1');

  app.enableCors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Validation — whitelist strips unknown properties (AGENTS.md §8)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Response shape — { success: true, data } / { success: false, error } (AGENTS.md §9)
  app.useGlobalInterceptors(app.get(ResponseInterceptor));
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
