import { ConsoleLogger } from '@nestjs/common';
import { enmascararTexto } from './enmascarar.util';

/**
 * El logger de toda la app (main.ts → `app.useLogger`). Cada mensaje pasa por
 * `enmascararTexto` antes de imprimirse: correos, DNI/CUIT, teléfonos, CBU,
 * tokens de MP/ML y `Bearer ...` no llegan enteros a los logs de Render,
 * los escriba quien los escriba (incluidos los errores de la base, que traen
 * `Key (email)=(...)`, y los cuerpos de error de MP y ML).
 *
 * Los `new Logger(...)` de cada servicio delegan en éste: no hay que tocarlos.
 */
export class LoggerEnmascarado extends ConsoleLogger {
  private tapar(args: unknown[]): unknown[] {
    return args.map((a) => {
      if (typeof a === 'string') return enmascararTexto(a);
      if (a instanceof Error) return enmascararTexto(a.stack ?? a.message);
      if (a && typeof a === 'object') {
        try {
          return enmascararTexto(JSON.stringify(a));
        } catch {
          return '[objeto]';
        }
      }
      return a;
    });
  }

  log(message: unknown, ...rest: unknown[]) {
    super.log(...(this.tapar([message, ...rest]) as [unknown, ...unknown[]]));
  }

  warn(message: unknown, ...rest: unknown[]) {
    super.warn(...(this.tapar([message, ...rest]) as [unknown, ...unknown[]]));
  }

  error(message: unknown, ...rest: unknown[]) {
    super.error(...(this.tapar([message, ...rest]) as [unknown, ...unknown[]]));
  }

  debug(message: unknown, ...rest: unknown[]) {
    super.debug(...(this.tapar([message, ...rest]) as [unknown, ...unknown[]]));
  }

  verbose(message: unknown, ...rest: unknown[]) {
    super.verbose(...(this.tapar([message, ...rest]) as [unknown, ...unknown[]]));
  }

  fatal(message: unknown, ...rest: unknown[]) {
    super.fatal(...(this.tapar([message, ...rest]) as [unknown, ...unknown[]]));
  }
}
