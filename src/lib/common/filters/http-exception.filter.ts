import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(HttpExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();

        let statusCode: number;
        let message: string;

        if (exception instanceof HttpException) {
            statusCode = exception.getStatus();
            const exceptionResponse = exception.getResponse();
            message =
                typeof exceptionResponse === 'string'
                    ? exceptionResponse
                    : (exceptionResponse as Record<string, unknown>).message as string ??
                      exception.message;
        } else {
            statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
            message = 'Internal server error';
        }

        // Log full details server-side; never leak stack traces to the client
        if (statusCode >= 500) {
            this.logger.error(
                exception instanceof Error ? exception.stack : exception,
            );
        }

        response.status(statusCode).json({
            success: false,
            statusCode,
            message: Array.isArray(message) ? message[0] : message,
        });
    }
}
