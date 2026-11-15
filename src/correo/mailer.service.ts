import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { ConfigCorreo, DatosCorreo, configDeCorreo, mensajeDeCorreo, opcionesDeTransporte } from './correo.util';

/**
 * El transporte de correo del taller, sobre nodemailer y SMTP. Se configura
 * por entorno (ver `correo.util`); sin configuración, `configurado()` es
 * false y `CorreosService` lo dice con un código claro en vez de fallar.
 *
 * `MAIL_TRANSPORT=json` (desarrollo): nodemailer arma el mensaje y lo devuelve
 * como JSON sin mandar nada, así el flujo entero se prueba sin una casilla.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly config: ConfigCorreo | null = configDeCorreo(process.env);
  private readonly pruebas = process.env['MAIL_TRANSPORT'] === 'json';
  /** Dos transportes: el de siempre y uno con más paciencia para los correos con adjuntos. */
  private transporte: Transporter | null = null;
  private transporteConAdjuntos: Transporter | null = null;

  configurado(): boolean {
    return this.pruebas || this.config !== null;
  }

  estado(): { configurado: boolean; remitente: string | null; pruebas: boolean } {
    return {
      configurado: this.configurado(),
      remitente: this.config?.from ?? (this.pruebas ? 'pruebas (no se envía)' : null),
      pruebas: this.pruebas && !this.config,
    };
  }

  /**
   * La casilla del propio taller, para los avisos que le llegan a él (el
   * botón de arrepentimiento): la de respuesta si hay una, si no la del
   * remitente. La empresa no tiene un correo propio cargado, y estas dos son
   * las que el taller ya lee. `null` sin correo configurado.
   */
  casillaDelTaller(): string | null {
    if (!this.config) return this.pruebas ? 'taller@gusmat.local' : null;
    const casilla = this.config.replyTo || this.config.from;
    return /<([^>]+)>/.exec(casilla)?.[1]?.trim() || casilla.trim() || null;
  }

  async enviar(datos: DatosCorreo): Promise<{ messageId?: string }> {
    if (!this.configurado()) throw new Error('El correo no está configurado');
    const conAdjuntos = !!datos.adjuntos?.length;
    const t = conAdjuntos
      ? (this.transporteConAdjuntos ??= this.crearTransporte(true))
      : (this.transporte ??= this.crearTransporte(false));
    const info = await t.sendMail(mensajeDeCorreo(datos, {
      from: this.config?.from ?? 'FG services <no-reply@fgservices.local>',
      replyTo: this.config?.replyTo,
    }));
    if (this.pruebas && !this.config) this.logger.log(`[pruebas] correo a ${datos.para}: ${datos.asunto}`);
    return { messageId: (info as { messageId?: string })?.messageId };
  }

  private crearTransporte(conAdjuntos: boolean): Transporter {
    if (!this.config) return nodemailer.createTransport({ jsonTransport: true });
    // Los timeouts NO son opcionales acá. nodemailer resuelve la promesa recién
    // cuando llega el 250 final del servidor al DATA, y Gmail encola el mensaje
    // ANTES de mandar ese 250: si esa última línea se pierde, el mail LLEGA y la
    // promesa queda colgada hasta el socketTimeout por defecto, que son DIEZ
    // MINUTOS. Con el request HTTP abierto todo ese rato, el botón del ERP se
    // queda en "Enviando…" y el operario no sabe si el correo salió.
    return nodemailer.createTransport(opcionesDeTransporte(this.config, conAdjuntos));
  }
}
