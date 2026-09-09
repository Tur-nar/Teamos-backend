interface VerifyEmailParams {
  name: string;
  verifyUrl: string;
}

export function renderVerifyEmail({ name, verifyUrl }: VerifyEmailParams): string {
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'TeamOS';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Verify Your Email</title>
    </head>
    <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Inter','Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 0;">
        <tr>
          <td align="center">
            <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
              <!-- Header -->
              <tr>
                <td style="background-color:#1C2458;padding:32px 40px;text-align:center;">
                  <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">${appName}</h1>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:40px;">
                  <h2 style="margin:0 0 16px;color:#1C2458;font-size:20px;font-weight:600;">Verify your email</h2>
                  <p style="margin:0 0 24px;color:#4a5568;font-size:16px;line-height:1.6;">
                    Hi <strong>${name}</strong>, thanks for signing up! Please verify your email address to activate your account and get started.
                  </p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="padding:8px 0 32px;">
                        <a href="${verifyUrl}"
                          style="display:inline-block;background-color:#2563EB;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:600;letter-spacing:0.3px;">
                          Verify Email Address
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0 0 8px;color:#718096;font-size:14px;line-height:1.5;">
                    If the button doesn't work, copy and paste this link into your browser:
                  </p>
                  <p style="margin:0 0 24px;word-break:break-all;">
                    <a href="${verifyUrl}" style="color:#2563EB;font-size:13px;">${verifyUrl}</a>
                  </p>
                  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
                  <p style="margin:0;color:#a0aec0;font-size:13px;line-height:1.5;">
                    This link expires in 24 hours. If you didn't create an account on ${appName}, you can safely ignore this email.
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color:#f7fafc;padding:20px 40px;text-align:center;">
                  <p style="margin:0;color:#a0aec0;font-size:12px;">
                    &copy; ${new Date().getFullYear()} ${appName}. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`.trim();
}
