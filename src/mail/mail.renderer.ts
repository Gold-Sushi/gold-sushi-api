/**
 * Compiles the Pug email templates to HTML.
 *
 * Resend's API takes rendered `html`, not a template name, so the compile step
 * that `@nestjs-modules/mailer`'s PugAdapter used to own lives here now.
 *
 * Templates are resolved relative to this file, i.e. `dist/mail/template` at
 * runtime — they get there via the asset glob in `nest-cli.json`.
 */
import { join } from 'path';
import * as pug from 'pug';

const TEMPLATE_DIR = join(__dirname, 'template');

export const renderTemplate = (name: string, context: Record<string, unknown>): string =>
  // `cache: true` makes pug memoize the compiled function per filename.
  pug.compileFile(join(TEMPLATE_DIR, `${name}.pug`), { cache: true })(context);
