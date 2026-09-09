import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

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
    private smtpTransport: Transporter | null = null;
    private from: string;
    private mailer: 'smtp' | 'resend' | 'log' = 'log';

    constructor(private readonly configService: ConfigService) {
        const fromName = this.configService.get<string>('MAIL_FROM_NAME', 'TeamOS');
        const fromAddress = this.configService.get<string>('MAIL_FROM_ADDRESS', 'onboarding@resend.dev');
        this.from = `${fromName} <${fromAddress}>`;
    }

    onModuleInit() {
        MailService.instance = this;
        const mailerConfig = this.configService.get<string>('MAIL_MAILER');

        if (mailerConfig === 'smtp') {
            const host = this.configService.get<string>('MAIL_HOST');
            const port = this.configService.get<number>('MAIL_PORT', 2525);
            const user = this.configService.get<string>('MAIL_USERNAME');
            const pass = this.configService.get<string>('MAIL_PASSWORD');

            this.smtpTransport = nodemailer.createTransport({
                host,
                port,
                auth: { user, pass },
            });
            this.mailer = 'smtp';
            this.logger.log(`SMTP configured (${host}:${port}) — emails via Mailtrap`);
        } else {
            const apiKey = this.configService.get<string>('RESEND_API_KEY');
            if (apiKey) {
                this.resend = new Resend(apiKey);
                this.mailer = 'resend';
                this.logger.log('Resend configured — emails will be delivered');
            } else {
                this.logger.warn('No mailer configured — emails will be logged to console only');
            }
        }
    }

    static getInstance(): MailService | null {
        return MailService.instance;
    }

    async send(options: SendMailOptions): Promise<void> {
        if (this.mailer === 'smtp' && this.smtpTransport) {
            try {
                const info = await this.smtpTransport.sendMail({
                    from: this.from,
                    to: options.to,
                    subject: options.subject,
                    html: options.html,
                });
                this.logger.log(`Email sent via SMTP to ${options.to}: "${options.subject}" (messageId: ${info.messageId})`);
            } catch (error) {
                this.logger.error(
                    `SMTP send failed to ${options.to}: ${error instanceof Error ? error.message : error}`,
                );
                throw error;
            }
        } else if (this.mailer === 'resend' && this.resend) {
            try {
                const { data, error } = await this.resend.emails.send({
                    from: this.from,
                    to: options.to,
                    subject: options.subject,
                    html: options.html,
                });
                if (error) {
                    this.logger.error(`Resend dispatch error to ${options.to}: ${error.message}`);
                    throw new Error(`Resend email delivery failed: ${error.message}`);
                }
                this.logger.log(`Email sent via Resend to ${options.to}: "${options.subject}" (id: ${data?.id})`);
            } catch (error) {
                this.logger.error(
                    `Failed to send email to ${options.to}: ${error instanceof Error ? error.message : error}`,
                );
                throw error;
            }
        } else {
            this.logger.log(`[DEV] Email to: ${options.to} | Subject: ${options.subject}`);
            this.logger.debug(options.html);
        }
    }
}
