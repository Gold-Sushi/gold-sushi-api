import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { resendProvider } from './resend.provider';

@Global()
@Module({
  providers: [resendProvider, MailService],
  exports: [MailService],
})
export class MailModule {}
