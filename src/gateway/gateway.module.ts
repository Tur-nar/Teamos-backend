import { Global, Module } from "@nestjs/common";
import { TaskGateway } from "./task.gateway";

@Global()
@Module({
    providers: [TaskGateway],
    exports: [TaskGateway]
})
export class GatewayModule { }
