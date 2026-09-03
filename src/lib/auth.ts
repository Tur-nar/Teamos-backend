import 'dotenv/config';
import { PrismaClient } from "@prisma/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { organization } from 'better-auth/plugins';
import { ac, roles } from './auth/permissions';
import { MailService } from './mail/mail.service';
import { renderInviteEmail } from './mail/templates/invite.template';

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    idleTimeoutMillis: 30_000,
    max: 5,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
});

const prisma = new PrismaClient({ adapter });

export const auth = betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins: [
        ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",").map((o) =>
            o.trim(),
        ) ?? []),
    ].filter(Boolean) as string[],
    emailAndPassword: { enabled: true },
    user: {
        additionalFields: {
            onboarded: {
                type: 'boolean',
                defaultValue: false,
            },
        },
    },
    advanced: {
        defaultCookieAttributes: {
            sameSite: "none",
            secure: true,
            partitioned: true,
        },
    },

    socialProviders: {
        // apple: {
        //     clientId: process.env.APPLE_CLIENT_ID!,
        //     clientSecret: process.env.APPLE_CLIENT_SECRET!,
        // },
        // google: {
        //     clientId: process.env.GOOGLE_CLIENT_ID!,
        //     clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        // },
    },
    plugins: [
        organization({
            ac,
            roles,
            allowUserToCreateOrganization: true,
            organizationLimit: 2,
            membershipLimit: 100, // members per org - raise for enterprise plans
            creatorRole: 'owner',
            invitationExpiresIn: 60 * 60 * 24, // 1 day
            sendInvitationEmail: async ({ email, organization, inviter, invitation }) => {
                const mail = MailService.getInstance();
                const html = renderInviteEmail({
                    inviterName: inviter.user.name,
                    orgName: organization.name,
                    invitationId: invitation.id,
                });
                const subject = `You're invited to join ${organization.name} on ${process.env.NEXT_PUBLIC_APP_NAME || 'TeamOS'}`;

                if (mail) {
                    await mail.send({ to: email, subject, html });
                } else {
                    // Fallback if NestJS container hasn't booted yet (shouldn't happen in practice)
                    console.log(`[AUTH] Invitation for ${email} to ${organization.name}`);
                    console.log(`[AUTH] Accept URL would be in the email HTML`);
                }
            },
        }),
    ],
});
