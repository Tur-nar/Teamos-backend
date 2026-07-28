import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const CurrentRole = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request._currentRole ?? null;
});