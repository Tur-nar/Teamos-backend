import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, map } from "rxjs";
import { Reflector } from '@nestjs/core'
import { RESPONSE_MESSAGE_KEY } from "../decorators/response-message/response-message";

type ResponseTemplate<T> = {
    statusCode: number;
    data: T;
    message: string;
}

type HttpResponse = {
    statusCode: number;
}

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
    constructor(private reflector: Reflector) { }

    intercept<T>(
        context: ExecutionContext,
        next: CallHandler<T>
    ): Observable<ResponseTemplate<T>> {
        const response = context.switchToHttp().getResponse<HttpResponse>();
        const message = this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE_KEY, [
            context.getHandler(),
            context.getClass(),
        ]) || "Success";

        return next.handle().pipe(
            map((data: T) => {
                return {
                    statusCode: response.statusCode,
                    data,
                    message
                }
            })
        )
    }
}