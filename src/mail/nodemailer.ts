import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { PugAdapter } from '@nestjs-modules/mailer/adapters/pug.adapter';
import { join } from 'path';

export const nodeMailer = MailerModule.forRootAsync({
  useFactory: (configService: ConfigService) => ({
    transport: {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // Use `true` for port 465, `false` for all other ports
      auth: {
        user: configService.get<string>('MAIL_SENDER'),
        pass: configService.get<string>('MAIL_PASSWORD'),
      },
    },
    defaults: {
      from: `"${configService.get<string>('MAIL_BRAND_NAME') ?? 'Gold Sushi'}" <${configService.get<string>('MAIL_SENDER')}>`,
    },
    template: {
      // Compiled templates live next to this file under `template/`.
      dir: join(__dirname, 'template'),
      adapter: new PugAdapter(),
      options: {
        // Allow `extends`/`include` partials to be resolved from the templates dir.
        strict: false,
      },
    },
  }),
  inject: [ConfigService],
});
