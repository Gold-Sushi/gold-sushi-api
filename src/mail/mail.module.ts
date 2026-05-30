import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { nodeMailer } from './nodemailer';

@Global()
@Module({
  imports: [
    nodeMailer,
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
