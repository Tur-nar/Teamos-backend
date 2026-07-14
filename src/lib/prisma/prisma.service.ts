import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    constructor() {
        super({
            adapter: new PrismaPg({
                connectionString: process.env.DATABASE_URL!,
                idleTimeoutMillis: 30_000,       // close idle connections after 30s
                max: 10,                          // max pool size
                connectionTimeoutMillis: 10_000,  // timeout waiting for a connection
                allowExitOnIdle: true,
            })
        });
    }
    async onModuleInit() {
        await this.$connect();
    }
    async onModuleDestroy() {
        await this.$disconnect();
    }
}