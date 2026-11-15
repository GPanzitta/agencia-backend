/**
 * Lo puro del envío de correos: leer la configuración SMTP del entorno y
 * armar el mensaje. El transporte (nodemailer) vive en `MailerService`.
 *
 * Variables: MAIL_HOST, MAIL_PORT (587 por defecto; 465 = TLS implícito),
 * MAIL_USER, MAIL_PASS, MAIL_FROM ("Nombre <correo>", por defecto el usuario)
 * y MAIL_REPLY_TO (opcional). Con Gmail/Workspace: host smtp.gmail.com,
 * puerto 587, usuario la casilla y clave una contraseña de aplicación.
 */
export interface ConfigCorreo {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  from: string;
  replyTo?: string;
}

/** Un archivo adjunto ya armado (`AdjuntosCorreoService.armar`). */
export interface AdjuntoCorreo { nombre: string; contenido: Buffer; mime: string }

/** Lo que sale: el HTML y el texto plano ya armados por `correoMaquetado`, y los adjuntos si hay. */
/** El taller que manda el correo a su cliente: su nombre se ve como remitente y las respuestas le llegan a él. */
export interface RemitenteCorreo { nombre: string; responderA?: string | null }

export interface DatosCorreo { para: string; asunto: string; texto: string; html: string; adjuntos?: AdjuntoCorreo[]; remitente?: RemitenteCorreo }

export interface MensajeCorreo {
  from: string;
  replyTo?: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

/**
 * Los timeouts del transporte SMTP. No son opcionales (ver `MailerService`):
 * sin `socketTimeout`, un 250 final perdido deja el request colgado diez
 * minutos. Con adjuntos sube de 20 a 60 s: subir 20 MB por SMTP tarda.
 */
export function opcionesDeTransporte(config: ConfigCorreo, conAdjuntos: boolean) {
  const { host, port, secure, auth } = config;
  return {
    host,
    port,
    secure,
    auth,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: conAdjuntos ? 60_000 : 20_000,
  };
}

export function configDeCorreo(env: Record<string, string | undefined>): ConfigCorreo | null {
  const host = (env['MAIL_HOST'] ?? '').trim();
  const user = (env['MAIL_USER'] ?? '').trim();
  const pass = env['MAIL_PASS'] ?? '';
  if (!host || !user || !pass) return null;
  const port = Number(env['MAIL_PORT']) || 587;
  const replyTo = (env['MAIL_REPLY_TO'] ?? '').trim();
  const config: ConfigCorreo = {
    host, port, secure: port === 465,
    auth: { user, pass },
    from: (env['MAIL_FROM'] ?? '').trim() || user,
  };
  if (replyTo) config.replyTo = replyTo;
  return config;
}

/** El cuerpo lo escribe una persona en texto plano: se escapa y se respetan los saltos de línea. */
export function textoAHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\r?\n/g, '<br>');
}

/** Una sola línea y 200 caracteres como mucho (SEG-38). */
export function asuntoSeguro(asunto: string): string {
  return (asunto ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 200);
}

/**
 * El From con el nombre del taller y la casilla de la plataforma (spec
 * 2026-10-28 §13.6). Sin saltos de línea, que en una cabecera son inyección.
 */
function fromDelTaller(nombre: string, from: string): string {
  const casilla = /<([^>]+)>/.exec(from)?.[1]?.trim() || from.trim();
  const limpio = nombre.replace(/\s*[\r\n]+\s*/g, ' ').replace(/(["\\])/g, '\\$1');
  return `"${limpio}" <${casilla}>`;
}

export function mensajeDeCorreo(datos: DatosCorreo, remitente: { from: string; replyTo?: string }): MensajeCorreo {
  const m: MensajeCorreo = {
    from: datos.remitente ? fromDelTaller(datos.remitente.nombre, remitente.from) : remitente.from,
    to: datos.para,
    // SEG-38: el asunto puede llevar texto de un visitante (pedido de servicio,
    // arrepentimiento): sin saltos de línea, que en una cabecera son inyección.
    subject: asuntoSeguro(datos.asunto),
    text: datos.texto,
    html: datos.html,
  };
  const responderA = datos.remitente?.responderA || remitente.replyTo;
  if (responderA) m.replyTo = responderA;
  if (datos.adjuntos?.length) {
    m.attachments = datos.adjuntos.map((a) => ({ filename: a.nombre, content: a.contenido, contentType: a.mime }));
  }
  return m;
}
