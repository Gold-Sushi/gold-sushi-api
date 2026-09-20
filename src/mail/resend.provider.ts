import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

/** DI token for the Resend client — `null` when no API key is configured. */
export const RESEND_CLIENT = Symbol('RESEND_CLIENT');

export const resendProvider: Provider = {
  provide: RESEND_CLIENT,
  useFactory: (configService: ConfigService): Resend | null => {
    const apiKey = configService.get<string>('RESEND_API_KEY');

    if (!apiKey) {
      // Booting without mail configured is supported: MailService skips sends
      // instead of failing, so registration/checkout still work locally.
      new Logger('ResendProvider').warn('RESEND_API_KEY is not set — outgoing emails will be skipped.');
      return null;
    }

    return new Resend(apiKey);
  },
  inject: [ConfigService],
};
