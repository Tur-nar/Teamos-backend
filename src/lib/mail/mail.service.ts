import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface SendMailOptions {
    to: string;
    subject: string;
    html: string;
}

@Injectable()
export class MailService implements OnModuleInit {
    private static instance: MailService | null = null;
    private readonly logger = new Logger(MailService.name);
    private resend: Resend | null = null;
    private from: string;

    constructor(private readonly configService: ConfigService) {
        const fromName = this.configService.get<string>('MAIL_FROM_NAME', 'TeamOS');
        const fromAddress = this.configService.get<string>('MAIL_FROM_ADDRESS', 'noreply@teamos.app');
        this.from = `${fromName} <${fromAddress}>`;
    }

    onModuleInit() {
        MailService.instance = this;

        const apiKey = this.configService.get<string>('RESEND_API_KEY');
        if (apiKey) {
            this.resend = new Resend(apiKey);
            this.logger.log('Resend configured — emails will be delivered');
        } else {
            this.logger.warn(
                'RESEND_API_KEY not set — emails will be logged to console only',
            );
        }
    }

    /**
     * Static bridge so that `auth.ts` (which lives outside the NestJS DI container)
     * can access the MailService at runtime after the container boots.
     */
    static getInstance(): MailService | null {
        return MailService.instance;
    }

    async send(options: SendMailOptions): Promise<void> {
        if (this.resend) {
            try {
                await this.resend.emails.send({
                    from: this.from,
                    to: options.to,
                    subject: options.subject,
                    html: options.html,
                });
                this.logger.log(`Email sent to ${options.to}: "${options.subject}"`);
            } catch (error) {
                this.logger.error(
                    `Failed to send email to ${options.to}: ${error instanceof Error ? error.message : error}`,
                );
                throw error;
            }
        } else {
            this.logger.log(
                `[DEV] Email to: ${options.to} | Subject: ${options.subject}`,
            );
            this.logger.debug(options.html);
        }
    }
}
