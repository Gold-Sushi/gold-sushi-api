import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IMailService } from './mailService.interface';
import { MailerService as MailerMain } from '@nestjs-modules/mailer';
// import * as pug from 'pug';

type TemplateType = 
  'EmailConfirmation' | 
  'ResetPassword' | 
  'ResetPasswordConfirm' | 
  'Registration' | 
  'OrderConfirmation';

@Injectable()
export class MailService implements IMailService {
  constructor(private readonly mailerMain: MailerMain) {}

  async sendMail(template: TemplateType, payload: any): Promise<void> {
    const render = this.createEmail(template, payload);
    // await this._processSendEmail(datamailer.to, datamailer.subject, render);
  }

  private createEmail(template: TemplateType, payload: any) {
    return pug.renderFile(template, { data });
    return '';
  }

  private async _processSendEmail(to: string, subject: string, body: string): Promise<void> {
    await this.mailerMain
      .sendMail({
        to: to,
        subject: subject,
        html: body,
      })
      .then(() => {
        console.log('Email sent');
      })
      .catch((e) => {
        console.log('Error sending email', e);
      });
  }
}
